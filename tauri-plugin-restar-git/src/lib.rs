use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub mod commands;
pub mod error;

pub use error::{Error, Result};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("restar-git")
        .invoke_handler(tauri::generate_handler![
            commands::git_is_repo,
            commands::git_init,
            commands::git_status,
            commands::git_stage,
            commands::git_unstage,
            commands::git_commit,
            commands::git_log,
            commands::git_diff_file,
            commands::git_discard,
            commands::git_get_remotes,
            commands::git_push,
        ])
        .build()
}
