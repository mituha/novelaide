use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub use models::*;

mod commands;
mod counter;
mod error;
mod formatter;
mod models;

pub use error::{Error, Result};
pub use formatter::{extract_ruby_text, format_ruby, format_smart_ruby, strip_ruby, transform_to_html};
pub use counter::count_characters;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("novelaid-ruby")
        .invoke_handler(tauri::generate_handler![
            commands::format_ruby,
            commands::format_smart_ruby,
            commands::transform_to_html,
            commands::strip_ruby,
            commands::extract_ruby_text,
            commands::count_characters,
        ])
        .build()
}
