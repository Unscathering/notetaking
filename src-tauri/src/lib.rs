/// Starts Basalt: one window showing the interface, with access to the file
/// system (for the notes folder) and the system's folder picker.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("Basalt could not start");
}
