const COMMANDS: &[&str] = &[
    "scan_project",
    "index_documents",
    "index_document",
    "get_metadata_cache",
    "get_entities",
    "get_ruby_dictionary",
    "get_calibration_context",
    "update_file_metadata",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
