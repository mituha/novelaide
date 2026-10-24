use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub mod commands;
pub mod error;

pub use error::{Error, Result};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("restar-settings")
        .invoke_handler(tauri::generate_handler![
            commands::load_settings,
            commands::save_settings,
            commands::reset_settings,
            commands::get_settings_path,
        ])
        .build()
}
