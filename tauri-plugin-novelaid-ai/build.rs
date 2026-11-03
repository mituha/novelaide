const COMMANDS: &[&str] = &[
    "ai_is_available",
    "ai_get_models",
    "ai_send_message",
    "ai_run_tool",
    "ai_get_env_api_key",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
