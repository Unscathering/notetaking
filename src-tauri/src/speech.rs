//! Speech to text for the mic button, all on this computer: whisper.cpp's
//! command-line program (downloaded once from its GitHub releases) and a voice
//! model (downloaded once from Hugging Face). It runs on the processor, so it
//! never competes with the AI for the graphics card. Recordings are passed in
//! as WAV files and deleted after.

use crate::ai::{client, download, quiet, Engine};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager, State};

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("speech");
    std::fs::create_dir_all(dir.join("models")).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// whisper.cpp's program: whisper-cli in newer releases, main in older ones.
fn find_cli(dir: &Path) -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["whisper-cli.exe", "main.exe"] } else { &["whisper-cli", "main"] };
    for name in names {
        let direct = dir.join(name);
        if direct.is_file() {
            return Some(direct);
        }
    }
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        if entry.path().is_dir() {
            if let Some(found) = find_cli(&entry.path()) {
                return Some(found);
            }
        }
    }
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechStatus {
    engine: bool,
    models: Vec<String>,
}

#[tauri::command]
pub fn speech_status(app: AppHandle) -> Result<SpeechStatus, String> {
    let dir = root(&app)?;
    let models = std::fs::read_dir(dir.join("models"))
        .map(|r| r.flatten().filter_map(|e| e.file_name().to_str().filter(|n| n.ends_with(".bin")).map(String::from)).collect())
        .unwrap_or_default();
    Ok(SpeechStatus { engine: find_cli(&dir.join("engine")).is_some(), models })
}

/// The whisper.cpp download for this computer: the plain 64-bit Windows build.
fn pick_asset(assets: &[serde_json::Value]) -> Option<String> {
    let name = |a: &serde_json::Value| a["name"].as_str().unwrap_or("").to_lowercase();
    let url = |a: &serde_json::Value| a["browser_download_url"].as_str().map(String::from);
    assets
        .iter()
        .find(|a| name(a) == "whisper-bin-x64.zip")
        .or_else(|| {
            assets.iter().find(|a| {
                let n = name(a);
                n.ends_with(".zip") && n.contains("bin-x64") && !n.contains("cublas") && !n.contains("cuda") && !n.contains("blas") && !n.contains("arm")
            })
        })
        .and_then(url)
}

/// Downloads whatever's missing: the engine, then the voice model.
#[tauri::command]
pub async fn speech_install(app: AppHandle, engine: State<'_, Engine>, model: String) -> Result<(), String> {
    if !matches!(model.as_str(), "base" | "small" | "base.en" | "small.en") {
        return Err("That isn't a voice model Basalt knows.".into());
    }
    let dir = root(&app)?;
    if find_cli(&dir.join("engine")).is_none() {
        let res = client()?
            .get("https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=6")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("Couldn't reach GitHub to get the speech engine: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("GitHub said {} when asked for the speech engine. Try again in a few minutes.", res.status()));
        }
        let releases: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let list = releases.as_array().cloned().unwrap_or_default();
        let url = list
            .iter()
            .filter(|r| !r["draft"].as_bool().unwrap_or(false))
            .find_map(|r| pick_asset(r["assets"].as_array().map(Vec::as_slice).unwrap_or(&[])))
            .ok_or("Couldn't find the speech engine for this computer on GitHub.")?;
        let zip_path = dir.join("engine.zip");
        download(&app, &engine, &url, &zip_path, "speech-engine").await?;
        let target = dir.join("engine");
        let _ = std::fs::remove_dir_all(&target);
        let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
        zip::ZipArchive::new(file).and_then(|mut z| z.extract(&target)).map_err(|e| format!("Couldn't unpack the speech engine: {e}"))?;
        let _ = std::fs::remove_file(&zip_path);
        find_cli(&target).ok_or("The speech engine download looks incomplete.")?;
    }
    let file = format!("ggml-{model}.bin");
    let dest = dir.join("models").join(&file);
    if !dest.exists() {
        let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{file}");
        download(&app, &engine, &url, &dest, "speech-model").await?;
    }
    Ok(())
}

/// Turns a recording (a 16 kHz WAV file) into text, then deletes the recording.
#[tauri::command]
pub async fn speech_transcribe(app: AppHandle, wav: String, model: String, language: Option<String>) -> Result<String, String> {
    let dir = root(&app)?;
    let cli = find_cli(&dir.join("engine")).ok_or("The speech engine isn't installed yet.")?;
    let model_path = dir.join("models").join(format!("ggml-{model}.bin"));
    if !model_path.exists() {
        return Err("That voice model isn't downloaded yet.".into());
    }
    let threads = std::thread::available_parallelism().map(|n| n.get().min(8)).unwrap_or(4).to_string();
    let lang = language.unwrap_or_else(|| "auto".into());
    let wav_path = PathBuf::from(&wav);
    let out = tokio::task::spawn_blocking(move || {
        quiet(
            Command::new(&cli)
                .args(["-m", &model_path.to_string_lossy(), "-f", &wav_path.to_string_lossy()])
                .args(["-nt", "-np", "-l", &lang, "-t", &threads])
                .current_dir(cli.parent().unwrap_or(Path::new("."))),
        )
        .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Couldn't start the speech engine: {e}"))?;
    let _ = std::fs::remove_file(&wav);
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("The speech engine stopped: {}", err.lines().last().unwrap_or("no reason given")));
    }
    // One line per stretch of speech; joined into sentences.
    let text = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('[') && *l != "(blank audio)")
        .collect::<Vec<_>>()
        .join(" ");
    Ok(text.trim().to_string())
}
