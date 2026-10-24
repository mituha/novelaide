const COMMANDS: &[&str] = &[
    "ai_is_available",
    "ai_get_models",
    "ai_send_message",
    "ai_run_tool",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
