use tauri::{command, AppHandle, Runtime};
use crate::models::*;
use crate::Result;
use crate::NovelaidCalibrationExt;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.novelaid_calibration().ping(payload)
}

#[command]
pub(crate) async fn check_text<R: Runtime>(
    app: AppHandle<R>,
    text: String,
) -> Result<CheckTextResult> {
    app.novelaid_calibration().check_text(&text)
}

#[command]
pub(crate) async fn tokenize_text<R: Runtime>(
    app: AppHandle<R>,
    text: String,
) -> Result<Vec<TokenInfo>> {
    app.novelaid_calibration().tokenize_text(&text)
}

#[command]
pub(crate) async fn get_ruby_candidates<R: Runtime>(
    app: AppHandle<R>,
    text: String,
) -> Result<Vec<RubyCandidate>> {
    app.novelaid_calibration().get_ruby_candidates(&text)
}

#[command]
pub(crate) async fn update_project_dictionary<R: Runtime>(
    app: AppHandle<R>,
    entries: Vec<ProjectDictionaryEntry>,
) -> Result<()> {
    app.novelaid_calibration().update_project_dictionary(&entries)
}
