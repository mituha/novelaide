use crate::error::Result;
use crate::models::{
    CalibrationProjectContext, DocumentContentWithMetadata, MetadataCache, ProjectEntity,
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

#[command]
pub(crate) async fn extract_frontmatter<R: Runtime>(
    app: AppHandle<R>,
    content: String,
) -> Result<DocumentContentWithMetadata> {
    Ok(app.novelaid_metadata().extract_frontmatter(&content))
}

#[command]
pub(crate) async fn format_frontmatter<R: Runtime>(
    app: AppHandle<R>,
    metadata: Value,
    content: String,
) -> Result<String> {
    Ok(app.novelaid_metadata().format_frontmatter(&metadata, &content))
}
