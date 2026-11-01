use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod commands;
mod desktop;
pub mod entities;
mod error;
pub mod frontmatter;
pub mod models;
pub mod ruby_dict;
pub mod scanner;

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
            commands::get_metadata_cache,
            commands::get_entities,
            commands::get_ruby_dictionary,
            commands::get_calibration_context,
            commands::update_file_metadata,
            commands::extract_frontmatter,
            commands::format_frontmatter,
        ])
        .setup(|app, _api| {
            app.manage(NovelaidMetadata::new(app.clone()));
            Ok(())
        })
        .build()
}
