use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;
pub mod attributes;
pub mod predictor;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::NovelaidFs;
#[cfg(mobile)]
use mobile::NovelaidFs;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the novelaid-fs APIs.
pub trait NovelaidFsExt<R: Runtime> {
  fn novelaid_fs(&self) -> &NovelaidFs<R>;
}

impl<R: Runtime, T: Manager<R>> crate::NovelaidFsExt<R> for T {
  fn novelaid_fs(&self) -> &NovelaidFs<R> {
    self.state::<NovelaidFs<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("novelaid-fs")
    .invoke_handler(tauri::generate_handler![
      commands::ping,
      commands::get_document_type,
      commands::get_directory_type,
      commands::set_project_directory,
      commands::get_project_directory,
      commands::read_directory,
      commands::get_document_stat,
      commands::read_file_binary,
      commands::read_document,
      commands::write_document,
      commands::create_directory,
      commands::create_file,
      commands::create_next_file,
      commands::remove,
      commands::rename,
      commands::copy,
      commands::get_metadata_cache,
      commands::scan_documents
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let novelaid_fs = mobile::init(app, api)?;
      #[cfg(desktop)]
      let novelaid_fs = desktop::init(app, api)?;
      app.manage(novelaid_fs);
      Ok(())
    })
    .build()
}
