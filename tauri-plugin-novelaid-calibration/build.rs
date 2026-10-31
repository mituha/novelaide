const COMMANDS: &[&str] = &[
    "ping",
    "check_text",
    "tokenize_text",
    "get_ruby_candidates",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
