const COMMANDS: &[&str] = &[
    "get_mcp_status",
    "start_mcp_server",
    "stop_mcp_server",
    "respond_tool_call",
    "update_mcp_config",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
