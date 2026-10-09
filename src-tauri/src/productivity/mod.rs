use crate::file_io::{FileAccess, FileError};
use serde_json::Value;
use std::{collections::HashMap, fs, io::Write, path::{Path, PathBuf}, sync::Mutex};
use tauri::{Emitter, Manager};
use notify::{Watcher, RecursiveMode};
pub mod associations;

#[derive(Default)]
pub struct LaunchQueue(pub Mutex<Vec<String>>);
pub fn route_launch(app: &tauri::AppHandle, args: Vec<String>, cwd: &str) {
    let files: Vec<String> = args.into_iter().skip(1).filter(|s| !s.starts_with('-') && !s.contains('\0')).take(128).filter_map(|s| {
        let p = PathBuf::from(s); let p = if p.is_absolute() { p } else { Path::new(cwd).join(p) };
        if !p.is_file() { return None; }
        app.state::<FileAccess>().grant(&p).ok()?;
        Some(fs::canonicalize(p).ok()?.to_string_lossy().into_owned())
    }).collect();
    if !files.is_empty() {
        if let Ok(mut queue) = app.state::<LaunchQueue>().0.lock() { for path in files { if !queue.contains(&path) && queue.len() < 128 { queue.push(path); } } }
        let _ = app.emit("elorin://launch-ready", ());
    }
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
}
#[tauri::command]
pub fn launch_take(app: tauri::AppHandle) -> Vec<String> { app.state::<LaunchQueue>().0.lock().map(|mut q| std::mem::take(&mut *q)).unwrap_or_default() }

fn storage(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, FileError> {
    if !["workspace", "recent", "settings"].contains(&key) { return Err(FileError::new("invalid", "Unknown storage key")); }
    let dir = app.path().app_local_data_dir().map_err(|e| FileError::new("storage", e.to_string()))?;
    fs::create_dir_all(&dir).map_err(|e| FileError::new("storage", e.to_string()))?;
    Ok(dir.join(format!("{key}.json")))
}
#[tauri::command]
pub async fn productivity_read(app: tauri::AppHandle, key: String) -> Result<Option<Value>, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = storage(&app, &key)?; if !path.exists() { return Ok(None); }
        if fs::metadata(&path).map_err(|e| FileError::new("storage", e.to_string()))?.len() > 2 * 1024 * 1024 { return Err(FileError::new("storage", "Manifest exceeds budget")); }
        let raw = fs::read(&path).map_err(|e| FileError::new("storage", e.to_string()))?;
        match serde_json::from_slice::<Value>(&raw) { Ok(value) if key != "workspace" || value.get("version").and_then(Value::as_u64)==Some(1) && value.get("tabs").and_then(Value::as_array).map(|t|t.len()<=128).unwrap_or(false) => Ok(Some(value)), _ => { let preserved = path.with_extension(format!("corrupt-{}.json", uuid::Uuid::new_v4())); fs::rename(path, preserved).map_err(|e| FileError::new("storage", e.to_string()))?; Ok(None) } }
    }).await.map_err(|e| FileError::new("storage", e.to_string()))?
}
#[tauri::command]
pub async fn productivity_write(app: tauri::AppHandle, key: String, value: Value) -> Result<(), FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = storage(&app, &key)?; let bytes = serde_json::to_vec(&value).map_err(|e| FileError::new("storage", e.to_string()))?;
        if bytes.len() > 2 * 1024 * 1024 { return Err(FileError::new("storage", "Manifest exceeds budget")); }
        let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(|e| FileError::new("storage", e.to_string()))?;
        temp.write_all(&bytes).and_then(|_| temp.as_file().sync_all()).map_err(|e| FileError::new("storage", e.to_string()))?;
        temp.persist(&path).map_err(|e| FileError::new("storage", e.to_string()))?;
        #[cfg(unix)] fs::File::open(path.parent().unwrap()).and_then(|f| f.sync_all()).map_err(|e| FileError::new("storage", e.to_string()))?;
        Ok(())
    }).await.map_err(|e| FileError::new("storage", e.to_string()))?
}
// Reauthorization is constrained to the user's locally persisted references.
#[tauri::command]
pub async fn productivity_open(app: tauri::AppHandle, path: String) -> Result<(), FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = ["workspace", "recent"].iter().any(|key| {
            let Ok(file) = storage(&app, key) else { return false; };
            if fs::metadata(&file).map(|m| m.len() > 2 * 1024 * 1024).unwrap_or(true) { return false; }
            let Ok(raw) = fs::read(file) else { return false; }; let Ok(value) = serde_json::from_slice::<Value>(&raw) else { return false; };
            let list = if *key == "workspace" { value.get("tabs").and_then(Value::as_array) } else { value.as_array() };
            list.map(|l| l.iter().take(128).any(|v| v.get("path").and_then(Value::as_str) == Some(path.as_str()))).unwrap_or(false)
        });
        if !allowed || !Path::new(&path).is_absolute() { return Err(FileError::new("denied", "Path is not a stored reference")); }
        app.state::<FileAccess>().grant(Path::new(&path))?; Ok(())
    }).await.map_err(|e| FileError::new("storage", e.to_string()))?
}

pub struct FileWatches { inner: Mutex<WatchInner> }
struct WatchInner { watcher: notify::RecommendedWatcher, files: HashMap<PathBuf, usize>, parents: HashMap<PathBuf, usize>, leases: HashMap<String, PathBuf> }
impl FileWatches {
    pub fn new(app: tauri::AppHandle) -> Result<Self, notify::Error> {
        let handle = app.clone();
        let watcher = notify::recommended_watcher(move |result: Result<notify::Event, notify::Error>| {
            match result { Ok(event) => { let _ = handle.emit("elorin://file-change", serde_json::json!({"paths":event.paths, "kind":format!("{:?}",event.kind)})); }, Err(_) => { let _ = handle.emit("elorin://file-change", serde_json::json!({"paths":[],"kind":"Unavailable"})); } }
        })?;
        Ok(Self { inner: Mutex::new(WatchInner { watcher, files: HashMap::new(), parents: HashMap::new(), leases: HashMap::new() }) })
    }
}
impl FileWatches {
    pub fn release(&self, id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(path) = inner.leases.remove(id) {
                if let Some(count) = inner.files.get_mut(&path) { *count -= 1; if *count == 0 { inner.files.remove(&path); } }
                if let Some(parent) = path.parent() {
                    if let Some(count) = inner.parents.get_mut(parent) { *count -= 1; if *count == 0 { inner.parents.remove(parent); let _ = inner.watcher.unwatch(parent); } }
                }
            }
        }
    }
}
#[tauri::command]
pub fn file_watch(app: tauri::AppHandle, window: tauri::WebviewWindow, path: String, add: bool) -> Result<(), FileError> {
    let service = app.state::<FileWatches>();
    let id = serde_json::to_string(&(window.label(), &path)).map_err(|_|FileError::new("watch", "Invalid watch key"))?;
    if !add { service.release(&id); app.state::<crate::window_resources::WindowResources>().forget(crate::window_resources::Kind::Watch, &id); return Ok(()); }
    app.state::<FileAccess>().authorized_path(Path::new(&path))?;
    let mut inner = service.inner.lock().map_err(|_| FileError::new("watch", "Watcher lock failed"))?;
    if inner.leases.contains_key(&id) { return Ok(()); }
    let path = PathBuf::from(path);
    let parent = path.parent().ok_or_else(|| FileError::new("watch", "Missing parent"))?.to_path_buf();
    if inner.leases.len() >= 256 || inner.files.len() >= 128 && !inner.files.contains_key(&path) { return Err(FileError::new("watch", "Watcher budget reached")); }
    if !inner.parents.contains_key(&parent) { inner.watcher.watch(&parent, RecursiveMode::NonRecursive).map_err(|e| FileError::new("watch", e.to_string()))?; }
    *inner.files.entry(path.clone()).or_default() += 1; *inner.parents.entry(parent).or_default() += 1;
    inner.leases.insert(id.clone(), path); drop(inner);
    crate::window_resources::register(&app, window.label(), crate::window_resources::Kind::Watch, &id)
}

#[tauri::command]
pub fn platform_capabilities() -> Value { serde_json::json!({"native":true,"platform":std::env::consts::OS,"associations":cfg!(windows),"agent":false,"startup":false,"portable":!associations::installed()}) }
#[tauri::command]
pub fn default_apps(app: tauri::AppHandle) -> Result<(), FileError> {
    #[cfg(windows)] { use tauri_plugin_opener::OpenerExt; return app.opener().open_url("ms-settings:defaultapps", None::<&str>).map_err(|e| FileError::new("platform", e.to_string())); }
    #[cfg(not(windows))] { let _ = app; Err(FileError::new("unsupported", "Use your system's application settings")) }
}

#[cfg(test)]
mod workspace_watch_tests {
    use super::*;
    #[test]
    fn release_is_idempotent_and_preserves_other_windows() {
        let watcher = notify::recommended_watcher(|_: Result<notify::Event, notify::Error>| {}).unwrap();
        let path = PathBuf::from("C:/synthetic/note.txt");
        let parent = path.parent().unwrap().to_path_buf();
        let service = FileWatches { inner: Mutex::new(WatchInner { watcher,
            files: [(path.clone(), 2)].into_iter().collect(),
            parents: [(parent.clone(), 2)].into_iter().collect(),
            leases: [("main".into(), path.clone()), ("focus".into(), path.clone())].into_iter().collect() }) };
        service.release("focus"); service.release("focus");
        { let inner = service.inner.lock().unwrap(); assert_eq!(inner.files.get(&path), Some(&1)); assert_eq!(inner.parents.get(&parent), Some(&1)); assert!(inner.leases.contains_key("main")); }
        service.release("main");
        let inner = service.inner.lock().unwrap(); assert!(inner.files.is_empty()); assert!(inner.parents.is_empty()); assert!(inner.leases.is_empty());
    }
}
