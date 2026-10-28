//! Updating Basalt from inside the app: downloads the newest installer from
//! GitHub, starts it, and closes Basalt so it can be replaced. Notes, settings
//! and the AI engine and models are kept (they live outside the app's folder).

use crate::ai::{download, Engine};
use tauri::{AppHandle, State};

const SETUP_URL: &str = "https://github.com/Unscathering/notetaking/releases/latest/download/Basalt-Setup.exe";

#[tauri::command]
pub async fn update_install(app: AppHandle, engine: State<'_, Engine>) -> Result<(), String> {
    let dir = std::env::temp_dir().join("basalt-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let setup = dir.join("Basalt-Setup.exe");
    download(&app, &engine, SETUP_URL, &setup, "update").await?;
    // "/P": the installer runs by itself, showing only its progress. "/R": then opens Basalt again.
    std::process::Command::new(&setup)
        .args(["/P", "/R"])
        .spawn()
        .map_err(|e| format!("Couldn't start the installer: {e}"))?;
    engine.stop();
    app.exit(0);
    Ok(())
}
