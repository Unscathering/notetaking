mod ai;
mod update;
mod web;

use tauri::Manager;

/// Starts Basalt: one window showing the interface, with access to the file
/// system (for the notes folder), the system's folder picker, opening links in
/// the browser (for downloading updates), and Basalt's own local AI engine.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // A second Basalt (started by clicking a basalt:// link) hands the link to
    // this one and closes; this window comes to the front.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            // Registers basalt:// for this copy of Basalt too (the installer does it as well;
            // this covers the portable version).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
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
