use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;

mod commands;
mod error;
mod models;
pub mod rules;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::NovelaidCalibration;

pub trait NovelaidCalibrationExt<R: Runtime> {
    fn novelaid_calibration(&self) -> &NovelaidCalibration<R>;
}

impl<R: Runtime, T: Manager<R>> NovelaidCalibrationExt<R> for T {
    fn novelaid_calibration(&self) -> &NovelaidCalibration<R> {
        self.state::<NovelaidCalibration<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("novelaid-calibration")
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::check_text,
            commands::tokenize_text,
            commands::get_ruby_candidates,
        ])
        .setup(|app, api| {
            #[cfg(desktop)]
            let novelaid_calibration = desktop::init(app, api)?;
            app.manage(novelaid_calibration);
            Ok(())
        })
        .build()
}
