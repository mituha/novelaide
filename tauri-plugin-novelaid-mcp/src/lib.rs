use std::sync::Arc;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;
pub use error::{Error, Result};
pub use server::McpServerManager;

mod commands;
mod error;
mod models;
mod server;

pub trait NovelaidMcpExt<R: Runtime> {
    fn novelaid_mcp(&self) -> &Arc<McpServerManager>;
}

impl<R: Runtime, T: Manager<R>> NovelaidMcpExt<R> for T {
    fn novelaid_mcp(&self) -> &Arc<McpServerManager> {
        self.state::<Arc<McpServerManager>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let server_manager = Arc::new(McpServerManager::new());

    Builder::new("novelaid-mcp")
        .invoke_handler(tauri::generate_handler![
            commands::get_mcp_status,
            commands::start_mcp_server,
            commands::stop_mcp_server,
            commands::respond_tool_call,
            commands::update_mcp_config,
        ])
        .setup(|app, _api| {
            app.manage(server_manager);
            Ok(())
        })
        .build()
}
