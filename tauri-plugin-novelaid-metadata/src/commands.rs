use crate::error::Result;
use crate::models::{
    CalibrationProjectContext, MetadataCache, NovelaidDocument, ProjectEntity,
    ProjectRubyEntry, ProjectScanSummary,
};
use crate::NovelaidMetadataExt;
use serde_json::Value;
use tauri::{command, AppHandle, Runtime};

#[command]
pub(crate) async fn scan_project<R: Runtime>(
    app: AppHandle<R>,
    project_path: String,
) -> Result<ProjectScanSummary> {
    app.novelaid_metadata().scan_project(&project_path)
}

#[command]
pub(crate) async fn index_documents<R: Runtime>(
    app: AppHandle<R>,
    project_path: String,
    documents: Vec<NovelaidDocument>,
) -> Result<ProjectScanSummary> {
    Ok(app.novelaid_metadata().index_documents(&project_path, &documents))
}

#[command]
pub(crate) async fn index_document<R: Runtime>(
    app: AppHandle<R>,
    document: NovelaidDocument,
) -> Result<()> {
    app.novelaid_metadata().index_document(&document);
    Ok(())
}

#[command]
pub(crate) async fn get_metadata_cache<R: Runtime>(
    app: AppHandle<R>,
) -> Result<MetadataCache> {
    Ok(app.novelaid_metadata().get_metadata_cache())
}

#[command]
pub(crate) async fn get_entities<R: Runtime>(
    app: AppHandle<R>,
    category: Option<String>,
) -> Result<Vec<ProjectEntity>> {
    Ok(app.novelaid_metadata().get_entities(category))
}

#[command]
pub(crate) async fn get_ruby_dictionary<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ProjectRubyEntry>> {
    Ok(app.novelaid_metadata().get_ruby_dictionary())
}

#[command]
pub(crate) async fn get_calibration_context<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CalibrationProjectContext> {
    Ok(app.novelaid_metadata().get_calibration_context())
}

#[command]
pub(crate) async fn update_file_metadata<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    metadata: Value,
) -> Result<()> {
    app.novelaid_metadata().update_file_metadata(&path, metadata)
}
