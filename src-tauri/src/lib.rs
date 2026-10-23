mod fs;

use fs::{
    fs_create_dir, fs_create_file, fs_read_dir, fs_read_file, fs_remove, fs_rename, fs_write_file,
};

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
        .invoke_handler(tauri::generate_handler![
            greet,
            fs_read_dir,
            fs_read_file,
            fs_write_file,
            fs_create_file,
            fs_create_dir,
            fs_remove,
            fs_rename
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
