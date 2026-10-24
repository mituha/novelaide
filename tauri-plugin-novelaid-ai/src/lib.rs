use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

mod commands;
mod error;

pub use error::Error;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("novelaid-ai")
        .invoke_handler(tauri::generate_handler![
            commands::ai_is_available,
            commands::ai_get_models,
            commands::ai_send_message,
            commands::ai_run_tool,
        ])
        .build()
}
