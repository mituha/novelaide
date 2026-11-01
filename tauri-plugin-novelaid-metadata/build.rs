const COMMANDS: &[&str] = &[
    "scan_project",
    "get_metadata_cache",
    "get_entities",
    "get_ruby_dictionary",
    "get_calibration_context",
    "update_file_metadata",
    "extract_frontmatter",
    "format_frontmatter",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
