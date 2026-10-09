use crate::file_io::FileError;
use std::{fs, io::Write};
use tauri::Manager;
static RECOVERY_WRITE: std::sync::Mutex<()> = std::sync::Mutex::new(());
fn directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, FileError> { let dir = app.path().app_local_data_dir().map_err(|e| FileError::new("recovery", e.to_string()))?.join("document-recovery"); fs::create_dir_all(&dir).map_err(|e| FileError::new("recovery", e.to_string()))?; Ok(dir) }
#[tauri::command]
pub async fn document_recovery(app: tauri::AppHandle, id: String, content: Option<String>) -> Result<(), FileError> {
    tauri::async_runtime::spawn_blocking(move || write_recovery(app, id, content)).await.map_err(|e| FileError::new("recovery", e.to_string()))?
}
fn write_recovery(app: tauri::AppHandle, id: String, content: Option<String>) -> Result<(), FileError> {
    let _guard = RECOVERY_WRITE.lock().map_err(|_| FileError::new("recovery", "Recovery storage lock failed"))?;
    let id = uuid::Uuid::parse_str(&id).map_err(|_| FileError::new("recovery", "Invalid snapshot ID"))?;
    let dir = directory(&app)?; let path = dir.join(format!("{id}.json"));
    if let Some(content) = content {
        if content.len() > 8 * 1024 * 1024 { return Err(FileError::new("recovery", "Snapshot exceeds budget")); }
        let occupied = fs::read_dir(&dir).map_err(|e| FileError::new("recovery", e.to_string()))?.filter_map(Result::ok).filter(|entry| entry.path() != path).filter_map(|entry| { let kind = entry.file_type().ok()?; if kind.is_file() { entry.metadata().ok().map(|m| m.len()) } else { None } }).sum::<u64>();
        if occupied.saturating_add(content.len() as u64) > 64 * 1024 * 1024 { return Err(FileError::new("recovery", "Recovery storage is full. Restore or discard older snapshots first.")); }
        let mut temp = tempfile::NamedTempFile::new_in(&dir).map_err(|e| FileError::new("recovery", e.to_string()))?; temp.write_all(content.as_bytes()).and_then(|_| temp.as_file().sync_all()).map_err(|e| FileError::new("recovery", e.to_string()))?; temp.persist(&path).map_err(|e| FileError::new("recovery", e.to_string()))?;
    }
    else if path.exists() { fs::remove_file(path).map_err(|e| FileError::new("recovery", e.to_string()))?; } Ok(())
}
#[tauri::command]
pub async fn document_recovery_list(app: tauri::AppHandle) -> Result<Vec<(String, String)>, FileError> {
    tauri::async_runtime::spawn_blocking(move || list_recovery(app)).await.map_err(|e| FileError::new("recovery", e.to_string()))?
}
fn list_recovery(app: tauri::AppHandle) -> Result<Vec<(String, String)>, FileError> {
    let mut snapshots = Vec::new();
    let mut bytes = 0u64;
    for entry in fs::read_dir(directory(&app)?).map_err(|e| FileError::new("recovery", e.to_string()))?.take(128) {
        let entry = entry.map_err(|e| FileError::new("recovery", e.to_string()))?;
        if entry.file_type().map(|t| t.is_symlink()).unwrap_or(true) { continue; }
        let path = entry.path(); let Some(id) = path.file_stem().and_then(|s| s.to_str()) else { continue; };
        if uuid::Uuid::parse_str(id).is_err() || entry.metadata().map(|m| m.len() > 8 * 1024 * 1024).unwrap_or(true) { continue; }
        if let Ok(content) = fs::read_to_string(&path) { bytes += content.len() as u64; if bytes > 64 * 1024 * 1024 { break; } snapshots.push((id.to_owned(), content)); }
    } Ok(snapshots)
}
