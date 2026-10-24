const COMMANDS: &[&str] = &[
    "load_settings",
    "save_settings",
    "reset_settings",
    "get_settings_path",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
