// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_novelaid_fs::init())
        .plugin(tauri_plugin_restar_settings::init())
        .plugin(tauri_plugin_restar_git::init())
        .plugin(tauri_plugin_novelaid_ai::init())
        .plugin(tauri_plugin_novelaid_calibration::init())
        .plugin(tauri_plugin_novelaid_ruby::init())
        .plugin(tauri_plugin_novelaid_metadata::init())
        .invoke_handler(tauri::generate_handler![
            greet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
