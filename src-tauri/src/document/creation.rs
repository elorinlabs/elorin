use crate::file_io::{FileAccess, FileError};
use cap_std::{ambient_authority, fs::{Dir, OpenOptions}};
use std::{collections::HashMap, io::Write, path::{Path, PathBuf}, sync::{Arc, Mutex}};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

struct Location { path: PathBuf, directory: Dir }
#[derive(Default)]
pub struct CreateLocations(Mutex<HashMap<String, Arc<Location>>>);
#[derive(serde::Serialize)]
pub struct LocationInfo { id: String, label: String, path: String }
impl CreateLocations {
    fn register(&self, path: &Path, label: String) -> Result<LocationInfo, FileError> {
        let path = path.canonicalize().map_err(super::failure)?;
        let mut locations = self.0.lock().map_err(|_| FileError::new("storage", "Folder state unavailable."))?;
        let id = if let Some((id, _)) = locations.iter().find(|(_, location)| location.path == path) { id.clone() }
        else {
            if locations.len() >= 64 { return Err(FileError::new("limit", "Too many selected folders. Restart Elorin to select more.")); }
            let id = uuid::Uuid::new_v4().to_string();
            let directory = Dir::open_ambient_dir(&path, ambient_authority()).map_err(super::failure)?;
            locations.insert(id.clone(), Arc::new(Location { path: path.clone(), directory })); id
        };
        Ok(LocationInfo { id, label, path: path.to_string_lossy().into_owned() })
    }
    fn get(&self, id: &str) -> Result<Arc<Location>, FileError> {
        self.0.lock().map_err(|_| FileError::new("storage", "Folder state unavailable."))?.get(id).cloned()
            .ok_or_else(|| FileError::new("permissionDenied", "Choose a save location first."))
    }
}
fn validate_name(name: &str) -> Result<(), FileError> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_lowercase();
    let reserved = ["con", "prn", "aux", "nul"].contains(&stem.as_str())
        || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt")) && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if name.is_empty() || name.chars().count() > 190 || name.ends_with(['.', ' ']) || name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) || reserved {
        return Err(FileError::new("invalidName", "Use a valid file name without reserved characters."));
    }
    if !["txt", "md", "json", "csv"].contains(&name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str()) {
        return Err(FileError::new("unsupported", "Choose Plain Text, Markdown, JSON or CSV."));
    }
    Ok(())
}
#[tauri::command]
pub fn document_create_locations(app: tauri::AppHandle) -> Vec<LocationInfo> {
    let state = app.state::<CreateLocations>();
    [("Documents", app.path().document_dir()), ("Desktop", app.path().desktop_dir()), ("Downloads", app.path().download_dir())]
        .into_iter().filter_map(|(label, path)| path.ok().and_then(|p| state.register(&p, label.into()).ok())).collect()
}
#[tauri::command]
pub async fn document_pick_location(app: tauri::AppHandle, title: Option<String>) -> Result<Option<LocationInfo>, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = app.dialog().file().set_title(title.filter(|value| value.len() <= 256).unwrap_or_else(|| "Save location for new files".into())).blocking_pick_folder() else { return Ok(None); };
        let path = folder.into_path().map_err(|e| FileError::new("unsupported", e.to_string()))?;
        let label = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        app.state::<CreateLocations>().register(&path, label).map(Some)
    }).await.map_err(|e| FileError::new("unknown", e.to_string()))?
}
#[tauri::command]
pub fn document_name_available(app: tauri::AppHandle, location: String, name: String) -> Result<bool, FileError> {
    validate_name(&name)?;
    app.state::<CreateLocations>().get(&location)?.directory.try_exists(&name).map(|exists| !exists).map_err(super::failure)
}
fn create_bytes(location: &Location, name: &str, bytes: &[u8]) -> Result<(), FileError> {
    validate_name(name)?;
    if bytes.len() > 2 * 1024 * 1024 { return Err(FileError::new("limit", "Content exceeds the safe 2 MiB editing limit.")); }
    let mut options = OpenOptions::new(); options.write(true).create_new(true);
    let mut file = location.directory.open_with(name, &options).map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists { FileError::new("exists", "A file with this name already exists in this location.") } else { super::failure(e) })?;
    if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) { drop(file); let _ = location.directory.remove_file(name); return Err(super::failure(error)); }
    Ok(())
}
#[tauri::command]
pub async fn document_create(app: tauri::AppHandle, location: String, name: String, bytes: Vec<u8>) -> Result<super::SaveResult, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let location = app.state::<CreateLocations>().get(&location)?;
        create_bytes(&location, &name, &bytes)?;
        let path = location.path.join(&name);
        let fingerprint = super::fingerprint(&path)?;
        app.state::<FileAccess>().grant(&path)?;
        Ok(super::SaveResult { path: path.to_string_lossy().into_owned(), fingerprint })
    }).await.map_err(|e| FileError::new("unknown", e.to_string()))?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn reject_traversal_and_reserved_names() { for name in ["../a.txt", "a/b.txt", "a\\b.txt", "CON.txt", "lpt9.csv", "a.txt ", "a.exe"] { assert!(validate_name(name).is_err(), "{name}"); } assert!(validate_name("笔记.md").is_ok()); }
    #[test] fn create_does_not_overwrite_existing_file() { let dir = tempfile::tempdir().unwrap(); let locations = CreateLocations::default(); let info = locations.register(dir.path(), "Test".into()).unwrap(); let location = locations.get(&info.id).unwrap(); create_bytes(&location, "data.json", b"{}").unwrap(); assert_eq!(create_bytes(&location, "data.json", b"new").unwrap_err().code, "exists"); assert_eq!(std::fs::read(dir.path().join("data.json")).unwrap(), b"{}"); }
    #[test] fn forged_location_and_oversize_content_are_rejected() { let locations = CreateLocations::default(); assert!(locations.get("C:\\Users").is_err()); let dir = tempfile::tempdir().unwrap(); let info = locations.register(dir.path(), "Test".into()).unwrap(); assert!(create_bytes(&locations.get(&info.id).unwrap(), "a.txt", &vec![0; 2 * 1024 * 1024 + 1]).is_err()); assert!(!dir.path().join("a.txt").exists()); }
}
