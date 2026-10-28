/// Starts Basalt: one window showing the interface, with access to the file
/// system (for the notes folder), the system's folder picker, and opening
/// links in the browser (for downloading updates).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("Basalt could not start");
}
