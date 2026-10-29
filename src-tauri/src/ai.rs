//! Basalt's own AI engine. Everything runs on this computer:
//!
//! - The engine is llama.cpp's `llama-server`, downloaded once from its
//!   official GitHub releases into Basalt's app folder. It is started only
//!   when the AI is used, listens only on 127.0.0.1 (nothing outside this
//!   computer can reach it), and is stopped when idle or when Basalt closes.
//! - Models are GGUF files downloaded once from Hugging Face, or one you
//!   already have.
//! - Chats go from the window to the engine through this file, so no web
//!   requests leave the computer while you use the AI.

use futures_util::StreamExt;
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;

#[derive(Default)]
pub struct Engine {
    child: Mutex<Option<Child>>,
    port: Mutex<u16>,
    cancel_download: AtomicBool,
    cancel_chat: AtomicBool,
}

impl Engine {
    /// Stops the engine, if it's running. Called when Basalt closes too.
    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *self.port.lock().unwrap() = 0;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// The engine's name for it, like "Vulkan1".
    id: String,
    name: String,
    /// Built into the processor (it borrows normal memory, so it's slower).
    integrated: bool,
    memory_mb: u64,
    free_mb: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelFile {
    file: String,
    path: String,
    size_mb: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    engine: bool,
    models: Vec<ModelFile>,
    ram_mb: u64,
    running: bool,
    folder: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    what: String,
    done: u64,
    total: u64,
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("ai");
    std::fs::create_dir_all(dir.join("models")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn server_name() -> &'static str {
    if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

/// Finds llama-server inside the engine folder (zips sometimes nest it in a folder).
fn find_server(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join(server_name());
    if direct.exists() {
        return Some(direct);
    }
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(found) = find_server(&p) {
                return Some(found);
            }
        }
    }
    None
}

pub(crate) fn quiet(cmd: &mut Command) -> &mut Command {
    // No black console window flashing up on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

pub(crate) fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Basalt")
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_status(app: AppHandle, engine: State<'_, Engine>) -> Result<Status, String> {
    let dir = root(&app)?;
    let mut models = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir.join("models")) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("gguf") {
                models.push(ModelFile {
                    file: e.file_name().to_string_lossy().into_owned(),
                    path: p.to_string_lossy().into_owned(),
                    size_mb: e.metadata().map(|m| m.len() / 1_048_576).unwrap_or(0),
                });
            }
        }
    }
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    Ok(Status {
        engine: find_server(&dir.join("engine")).is_some(),
        models,
        ram_mb: sys.total_memory() / 1_048_576,
        running: *engine.port.lock().unwrap() != 0,
        folder: dir.to_string_lossy().into_owned(),
    })
}

/// The graphics cards the engine can use, with their memory.
#[tauri::command]
pub async fn ai_devices(app: AppHandle) -> Result<Vec<Device>, String> {
    let server = find_server(&root(&app)?.join("engine")).ok_or("The AI engine isn't installed yet.")?;
    let out = quiet(Command::new(&server).arg("--list-devices"))
        .stdin(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    // Lines look like: "  Vulkan0: NVIDIA GeForce RTX 4050 Laptop GPU (6141 MiB, 5933 MiB free)"
    let mut devices = Vec::new();
    for line in text.lines() {
        let Some((id, rest)) = line.split_once(": ") else { continue };
        let Some(open) = rest.rfind('(') else { continue };
        let name = rest[..open].trim().to_string();
        let nums: Vec<u64> = rest[open..]
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse().ok())
            .collect();
        if rest.contains("MiB") && nums.len() >= 2 {
            devices.push(Device { id: id.trim().to_string(), integrated: is_integrated(&name), name, memory_mb: nums[0], free_mb: nums[1] });
        }
    }
    Ok(devices)
}

/// Graphics built into the processor, like "AMD Radeon 780M Graphics" or
/// "Intel(R) UHD Graphics", as opposed to a separate graphics card.
fn is_integrated(name: &str) -> bool {
    let n = name.to_lowercase().replace("(tm)", "").replace("(r)", "").replace("  ", " ");
    let discrete = ["nvidia", "geforce", "rtx", "gtx", "quadro", "radeon rx", "radeon pro", "arc a", "arc b"];
    !discrete.iter().any(|d| n.contains(d)) && (n.ends_with("graphics") || n.contains("uhd") || n.contains("iris") || n.contains("vega"))
}

/// An error with every reason behind it, so a failed download says why.
fn reasons(e: &dyn std::error::Error) -> String {
    let mut text = e.to_string();
    let mut source = e.source();
    while let Some(s) = source {
        text.push_str(": ");
        text.push_str(&s.to_string());
        source = s.source();
    }
    text
}

/// How many pieces a big download is split into. Hugging Face and GitHub limit
/// each connection's speed, so several at once finish much sooner.
const PIECES: u64 = 8;

/// Opens a download: tries the normal way, then the old-fashioned way
/// (HTTP/1.1) if that can't connect. Asks for the first byte only, to learn the
/// size, where the file really lives (after redirects) and whether it can be
/// fetched in pieces.
async fn open(url: &str) -> Result<(reqwest::Client, reqwest::Response), String> {
    let first = client()?;
    match first.get(url).header("Range", "bytes=0-0").send().await {
        Ok(r) => Ok((first, r)),
        Err(e1) => {
            let http1 = reqwest::Client::builder().user_agent("Basalt").http1_only().build().map_err(|e| e.to_string())?;
            let r = http1
                .get(url)
                .header("Range", "bytes=0-0")
                .send()
                .await
                .map_err(|e| format!("Couldn't start the download: {} (first try: {})", reasons(&e), reasons(&e1)))?;
            Ok((http1, r))
        }
    }
}

pub(crate) async fn download(app: &AppHandle, engine: &Engine, url: &str, dest: &Path, what: &str) -> Result<(), String> {
    fetch(engine, url, dest, |done, total| {
        let _ = app.emit("ai-progress", Progress { what: what.into(), done, total });
    })
    .await
}

/// Downloads `url` to `dest`, calling `progress(done, total)` every megabyte or so.
async fn fetch(engine: &Engine, url: &str, dest: &Path, progress: impl Fn(u64, u64)) -> Result<(), String> {
    engine.cancel_download.store(false, Ordering::SeqCst);
    let (http, probe) = open(url).await?;
    if !probe.status().is_success() {
        return Err(format!("The download failed ({}).", probe.status()));
    }
    // "bytes 0-0/4683073952" → the whole size, if the server can send pieces.
    let total = probe
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next())
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|_| probe.status() == reqwest::StatusCode::PARTIAL_CONTENT);
    let real_url = probe.url().to_string();
    drop(probe);
    let part = dest.with_extension("part");
    let done = AtomicU64::new(0);
    let shown = AtomicU64::new(0);
    let tick = |n: u64, total: u64| {
        let now = done.fetch_add(n, Ordering::SeqCst) + n;
        let last = shown.load(Ordering::SeqCst);
        if now - last > 1_000_000 || now == total {
            shown.store(now, Ordering::SeqCst);
            progress(now, total);
        }
    };
    let result = match total {
        Some(total) if total > 20_000_000 => {
            let file = tokio::fs::File::create(&part).await.map_err(|e| e.to_string())?;
            file.set_len(total).await.map_err(|e| e.to_string())?;
            drop(file);
            let size = total.div_ceil(PIECES);
            let pieces = (0..PIECES).map(|i| (i * size, ((i + 1) * size).min(total))).filter(|(a, b)| a < b);
            futures_util::future::try_join_all(pieces.map(|(from, to)| piece(&http, engine, &real_url, &part, from, to, |n| tick(n, total))))
                .await
                .map(|_| ())
        }
        _ => whole(&http, engine, &real_url, &part, &tick).await,
    };
    if let Err(e) = result {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(e);
    }
    tokio::fs::rename(&part, dest).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Fetches bytes `from..to` into their place in the file. If the connection
/// drops, it carries on from where it stopped (a few times).
async fn piece(http: &reqwest::Client, engine: &Engine, url: &str, part: &Path, from: u64, to: u64, tick: impl Fn(u64)) -> Result<(), String> {
    use tokio::io::AsyncSeekExt;
    let mut file = tokio::fs::OpenOptions::new().write(true).open(part).await.map_err(|e| e.to_string())?;
    let mut at = from;
    let mut tries = 0;
    while at < to {
        if tries > 4 {
            return Err("The download kept getting cut off. Try again in a little while.".into());
        }
        let before = at;
        let res = http.get(url).header("Range", format!("bytes={}-{}", at, to - 1)).send().await;
        let mut stream = match res {
            Ok(r) if r.status() == reqwest::StatusCode::PARTIAL_CONTENT => r.bytes_stream(),
            Ok(r) => return Err(format!("The download failed ({}).", r.status())),
            Err(_) if tries < 4 => {
                tries += 1;
                tokio::time::sleep(Duration::from_secs(tries)).await;
                continue;
            }
            Err(e) => return Err(format!("The download was interrupted: {}", reasons(&e))),
        };
        file.seek(std::io::SeekFrom::Start(at)).await.map_err(|e| e.to_string())?;
        while let Some(chunk) = stream.next().await {
            if engine.cancel_download.load(Ordering::SeqCst) {
                return Err("Download stopped.".into());
            }
            match chunk {
                Ok(c) => {
                    let c = &c[..c.len().min((to - at) as usize)];
                    file.write_all(c).await.map_err(|e| e.to_string())?;
                    at += c.len() as u64;
                    tick(c.len() as u64);
                }
                Err(_) if tries < 4 => {
                    tries += 1;
                    break;
                }
                Err(e) => return Err(format!("The download was interrupted: {}", reasons(&e))),
            }
        }
        // Cut off without getting anywhere: that counts as a try.
        if at == before {
            tries += 1;
        }
    }
    file.flush().await.map_err(|e| e.to_string())
}

/// For servers that can't send pieces: one connection, start to finish.
async fn whole(http: &reqwest::Client, engine: &Engine, url: &str, part: &Path, tick: impl Fn(u64, u64)) -> Result<(), String> {
    let res = http.get(url).send().await.map_err(|e| format!("Couldn't start the download: {}", reasons(&e)))?;
    if !res.status().is_success() {
        return Err(format!("The download failed ({}).", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(part).await.map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if engine.cancel_download.load(Ordering::SeqCst) {
            return Err("Download stopped.".into());
        }
        let chunk = chunk.map_err(|e| format!("The download was interrupted: {}", reasons(&e)))?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        tick(chunk.len() as u64, total);
    }
    file.flush().await.map_err(|e| e.to_string())
}

/// Picks the engine file for this computer from a release's files: the one
/// that uses any graphics card (Vulkan), or the processor-only one if a
/// release doesn't have that.
fn pick_asset(assets: &[serde_json::Value]) -> Option<String> {
    let os = if cfg!(windows) { "win" } else { "ubuntu" };
    let named = |a: &serde_json::Value| a["name"].as_str().unwrap_or("").to_lowercase();
    let usable = |n: &str| n.ends_with(".zip") && n.contains(os) && n.contains("x64") && !n.contains("arm64") && !n.contains("cudart");
    for want in ["vulkan", "cpu"] {
        if let Some(a) = assets.iter().find(|a| {
            let n = named(a);
            usable(&n) && n.contains(want)
        }) {
            return a["browser_download_url"].as_str().map(String::from);
        }
    }
    None
}

/// Downloads the newest llama.cpp engine that works with any graphics card (Vulkan).
#[tauri::command]
pub async fn ai_install_engine(app: AppHandle, engine: State<'_, Engine>) -> Result<(), String> {
    let dir = root(&app)?;
    // The newest few releases, in case the very newest is still uploading its files.
    let res = client()?
        .get("https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=8")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Couldn't reach GitHub to get the AI engine: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("GitHub said {} when asked for the AI engine. Try again in a few minutes.", res.status()));
    }
    let releases: serde_json::Value = res.json().await.map_err(|e| format!("GitHub's answer didn't make sense: {e}"))?;
    let list = releases.as_array().cloned().unwrap_or_default();
    let url = list
        .iter()
        .filter(|r| !r["draft"].as_bool().unwrap_or(false))
        .find_map(|r| pick_asset(r["assets"].as_array().map(Vec::as_slice).unwrap_or(&[])))
        .ok_or_else(|| {
            let names: Vec<String> = list
                .first()
                .and_then(|r| r["assets"].as_array())
                .map(|a| a.iter().filter_map(|x| x["name"].as_str().map(String::from)).take(12).collect())
                .unwrap_or_default();
            format!("Couldn't find the AI engine for this computer among {} releases. Files in the newest: {}", list.len(), if names.is_empty() { "none".into() } else { names.join(", ") })
        })?;
    let zip_path = dir.join("engine.zip");
    download(&app, &engine, &url, &zip_path, "engine").await?;
    let target = dir.join("engine");
    let _ = std::fs::remove_dir_all(&target);
    let zip_file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    zip::ZipArchive::new(zip_file)
        .and_then(|mut z| z.extract(&target))
        .map_err(|e| format!("Couldn't unpack the AI engine: {e}"))?;
    let _ = std::fs::remove_file(&zip_path);
    find_server(&target).map(|_| ()).ok_or("The AI engine download looks incomplete.".into())
}

#[tauri::command]
pub async fn ai_download_model(app: AppHandle, engine: State<'_, Engine>, url: String, file: String) -> Result<(), String> {
    if file.contains(['/', '\\']) || !file.ends_with(".gguf") {
        return Err("That isn't a model file name.".into());
    }
    let dest = root(&app)?.join("models").join(&file);
    download(&app, &engine, &url, &dest, &file).await
}

#[tauri::command]
pub fn ai_cancel_download(engine: State<'_, Engine>) {
    engine.cancel_download.store(true, Ordering::SeqCst);
}

/// Copies a model file the user already has into Basalt's models folder.
#[tauri::command]
pub async fn ai_add_model(app: AppHandle, path: String) -> Result<String, String> {
    let from = PathBuf::from(&path);
    let name = from.file_name().and_then(|n| n.to_str()).ok_or("That isn't a file.")?.to_string();
    if !name.to_lowercase().ends_with(".gguf") {
        return Err("Pick a .gguf model file.".into());
    }
    let to = root(&app)?.join("models").join(&name);
    let total = std::fs::metadata(&from).map_err(|e| e.to_string())?.len();
    let _ = app.emit("ai-progress", Progress { what: name.clone(), done: 0, total });
    let app2 = app.clone();
    let name2 = name.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        use std::io::{Read, Write};
        let mut src = std::fs::File::open(&from).map_err(|e| e.to_string())?;
        let mut dst = std::fs::File::create(&to).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8 << 20];
        let mut done = 0u64;
        loop {
            let n = src.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            dst.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            done += n as u64;
            let _ = app2.emit("ai-progress", Progress { what: name2.clone(), done, total });
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(name)
}

#[tauri::command]
pub fn ai_delete_model(app: AppHandle, file: String) -> Result<(), String> {
    if file.contains(['/', '\\']) {
        return Err("That isn't a model file name.".into());
    }
    std::fs::remove_file(root(&app)?.join("models").join(file)).map_err(|e| e.to_string())
}

/// Starts the engine with a model, offloading `gpu_layers` layers to the
/// graphics card. Returns once it's ready to answer.
#[tauri::command]
pub async fn ai_start(app: AppHandle, engine: State<'_, Engine>, model: String, gpu_layers: u32, context: u32, device: Option<String>) -> Result<u16, String> {
    engine.stop();
    let server = find_server(&root(&app)?.join("engine")).ok_or("The AI engine isn't installed yet.")?;
    let port = std::net::TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map_err(|e| e.to_string())?.port();
    let child = quiet(
        Command::new(&server)
            .args(["-m", &model, "--host", "127.0.0.1", "--port", &port.to_string()])
            .args(["-ngl", &gpu_layers.to_string(), "-c", &context.to_string(), "--jinja"])
            // A smaller memory of the chat so far (half size, nearly the same quality), so more fits.
            .args(["-ctk", "q8_0"])
            // Only the chosen graphics card, not the one built into the processor.
            .args(device.as_deref().map(|d| vec!["--device", d]).unwrap_or_default())
            .current_dir(server.parent().unwrap_or(Path::new("."))),
    )
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("Couldn't start the AI engine: {e}"))?;
    *engine.child.lock().unwrap() = Some(child);
    let http = client()?;
    // Loading a model can take a little while the first time.
    for _ in 0..240 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let exited = engine.child.lock().unwrap().as_mut().map(|c| c.try_wait().ok().flatten().is_some()).unwrap_or(true);
        if exited {
            engine.stop();
            return Err("The AI engine stopped while loading the model. It may not fit in this computer's memory; try a smaller model.".into());
        }
        if let Ok(res) = http.get(format!("http://127.0.0.1:{port}/health")).send().await {
            if res.status().is_success() {
                *engine.port.lock().unwrap() = port;
                return Ok(port);
            }
        }
    }
    engine.stop();
    Err("The AI engine took too long to start.".into())
}

#[tauri::command]
pub fn ai_stop(engine: State<'_, Engine>) {
    engine.stop();
}

/// Sends a chat to the engine and passes its streamed answer back piece by piece.
#[tauri::command]
pub async fn ai_chat(engine: State<'_, Engine>, body: String, on_chunk: Channel<String>) -> Result<(), String> {
    let port = *engine.port.lock().unwrap();
    if port == 0 {
        return Err("The AI engine isn't running.".into());
    }
    engine.cancel_chat.store(false, Ordering::SeqCst);
    let res = client()?
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        return Err(format!("The AI engine said {status}: {}", res.text().await.unwrap_or_default()));
    }
    let mut stream = res.bytes_stream();
    // A piece can end halfway through a letter like "é" or an emoji; keep the
    // unfinished bytes for the next piece.
    let mut carry: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        if engine.cancel_chat.load(Ordering::SeqCst) {
            break;
        }
        carry.extend_from_slice(&chunk.map_err(|e| e.to_string())?);
        let whole = match std::str::from_utf8(&carry) {
            Ok(_) => carry.len(),
            Err(e) => e.valid_up_to(),
        };
        if whole > 0 {
            let text = String::from_utf8_lossy(&carry[..whole]).into_owned();
            carry.drain(..whole);
            on_chunk.send(text).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn ai_stop_chat(engine: State<'_, Engine>) {
    engine.cancel_chat.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    /// Run with a local server that sends pieces: `BASALT_TEST_URL=http://127.0.0.1:8765/big.bin cargo test fetch -- --ignored`.
    #[test]
    #[ignore]
    fn fetches_in_pieces_and_whole() {
        let url = std::env::var("BASALT_TEST_URL").unwrap();
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let dir = std::env::temp_dir();
        for (name, u) in [("pieces.bin", url.clone()), ("whole.bin", format!("{url}?norange"))] {
            let dest = dir.join(name);
            let last = std::sync::Mutex::new((0, 0));
            rt.block_on(super::fetch(&super::Engine::default(), &u, &dest, |d, t| *last.lock().unwrap() = (d, t))).unwrap();
            let want = std::fs::read(std::env::var("BASALT_TEST_FILE").unwrap()).unwrap();
            assert_eq!(std::fs::read(&dest).unwrap(), want, "{name}");
            println!("{name}: last progress {:?}", last.lock().unwrap());
        }
    }

    use super::pick_asset;
    use serde_json::json;

    #[test]
    fn picks_the_vulkan_engine_for_this_computer() {
        let os = if cfg!(windows) { "win" } else { "ubuntu" };
        let assets = vec![
            json!({ "name": format!("cudart-llama-bin-{os}-cuda-12.4-x64.zip"), "browser_download_url": "cudart" }),
            json!({ "name": format!("llama-b7100-bin-{os}-cpu-arm64.zip"), "browser_download_url": "arm" }),
            json!({ "name": format!("llama-b7100-bin-{os}-cpu-x64.zip"), "browser_download_url": "cpu" }),
            json!({ "name": format!("llama-b7100-bin-{os}-vulkan-x64.zip"), "browser_download_url": "vulkan" }),
        ];
        assert_eq!(pick_asset(&assets).as_deref(), Some("vulkan"));
        assert_eq!(pick_asset(&assets[..3]).as_deref(), Some("cpu"));
        assert_eq!(pick_asset(&assets[..2]), None);
    }

    #[test]
    fn tells_built_in_graphics_from_graphics_cards() {
        assert!(super::is_integrated("AMD Radeon 780M Graphics"));
        assert!(super::is_integrated("Intel(R) UHD Graphics 620"));
        assert!(super::is_integrated("Intel(R) Arc(TM) Graphics"));
        assert!(!super::is_integrated("NVIDIA GeForce RTX 4050 Laptop GPU"));
        assert!(!super::is_integrated("AMD Radeon RX 7800 XT"));
        assert!(!super::is_integrated("Intel(R) Arc(TM) A770 Graphics"));
    }
}
