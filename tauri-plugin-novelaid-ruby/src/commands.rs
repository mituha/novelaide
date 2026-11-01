use tauri::command;
use crate::formatter;
use crate::counter;
use crate::models::{CountOptions, DetailedCountResult, StrippedResultWithMap};

#[command]
pub fn format_ruby(surface: String, ruby: String) -> String {
    formatter::format_ruby(&surface, &ruby)
}

#[command]
pub fn format_smart_ruby(surface: String, ruby: String) -> String {
    formatter::format_smart_ruby(&surface, &ruby)
}

#[command]
pub fn transform_to_html(text: String) -> String {
    formatter::transform_to_html(&text)
}

#[command]
pub fn strip_ruby(text: String) -> String {
    formatter::strip_ruby(&text)
}

#[command]
pub fn strip_ruby_with_map(text: String) -> StrippedResultWithMap {
    formatter::strip_ruby_with_map(&text)
}

#[command]
pub fn extract_ruby_text(text: String) -> String {
    formatter::extract_ruby_text(&text)
}

#[command]
pub fn count_characters(text: String, options: Option<CountOptions>) -> DetailedCountResult {
    counter::count_characters(&text, options.unwrap_or_default())
}
