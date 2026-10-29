mod ai;
mod update;
mod web;

use tauri::Manager;

/// Starts Basalt: one window showing the interface, with access to the file
/// system (for the notes folder), the system's folder picker, opening links in
/// the browser (for downloading updates), and Basalt's own local AI engine.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ai::Engine::default())
        .invoke_handler(tauri::generate_handler![
            ai::ai_status,
            ai::ai_devices,
            ai::ai_install_engine,
            ai::ai_download_model,
            ai::ai_cancel_download,
            ai::ai_delete_model,
            ai::ai_add_model,
            ai::ai_start,
            ai::ai_stop,
            ai::ai_chat,
            ai::ai_stop_chat,
            update::update_install,
            web::clip_fetch,
        ])
        .build(tauri::generate_context!())
        .expect("Basalt could not start")
        .run(|app, event| {
            // The AI engine never outlives Basalt.
            if let tauri::RunEvent::Exit = event {
                app.state::<ai::Engine>().stop();
            }
        });
}
