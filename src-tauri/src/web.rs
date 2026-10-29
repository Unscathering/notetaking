//! Fetching a web page for the web clipper. The window can't read most sites
//! itself (they don't allow it), so the page is fetched here and handed back.

const MAX_BYTES: usize = 6 * 1024 * 1024;

#[tauri::command]
pub async fn clip_fetch(url: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("That isn't a web address. It should start with http:// or https://".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Basalt")
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| format!("Couldn't reach that page: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("The page said {}.", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| format!("The page didn't finish loading: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("That page is too big to clip.".into());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
