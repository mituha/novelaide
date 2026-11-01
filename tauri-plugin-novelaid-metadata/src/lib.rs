use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod commands;
mod desktop;
pub mod entities;
mod error;
pub mod indexer;
pub mod models;
pub mod ruby_dict;

pub use desktop::NovelaidMetadata;
pub use error::{Error, Result};

pub trait NovelaidMetadataExt<R: Runtime> {
    fn novelaid_metadata(&self) -> &NovelaidMetadata<R>;
}

impl<R: Runtime, T: Manager<R>> NovelaidMetadataExt<R> for T {
    fn novelaid_metadata(&self) -> &NovelaidMetadata<R> {
        self.state::<NovelaidMetadata<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("novelaid-metadata")
        .invoke_handler(tauri::generate_handler![
            commands::scan_project,
            commands::index_documents,
            commands::index_document,
            commands::get_metadata_cache,
            commands::get_entities,
            commands::get_ruby_dictionary,
            commands::get_calibration_context,
            commands::update_file_metadata,
        ])
        .setup(|app, _api| {
            app.manage(NovelaidMetadata::new(app.clone()));
            Ok(())
        })
        .build()
}
