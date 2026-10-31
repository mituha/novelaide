const COMMANDS: &[&str] = &[
    "format_ruby",
    "transform_to_html",
    "strip_ruby",
    "extract_ruby_text",
    "count_characters",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
