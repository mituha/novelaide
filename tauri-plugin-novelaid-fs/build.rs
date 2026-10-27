const COMMANDS: &[&str] = &[
    "ping",
    "get_document_type",
    "get_directory_type",
    "set_project_directory",
    "get_project_directory",
    "read_directory",
    "read_document",
    "write_document",
    "create_directory",
    "create_file",
    "create_next_file",
    "remove",
    "rename",
    "get_metadata_cache",
    "scan_project_metadata",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
