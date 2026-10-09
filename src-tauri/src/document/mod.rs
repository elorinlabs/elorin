use crate::file_io::{FileAccess, FileError};
use std::{fs, io::{Read, Write}, path::Path};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
pub mod recovery;
pub mod creation;
#[tauri::command]
pub async fn document_reload(app: tauri::AppHandle, path: String) -> Result<String, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        if fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false) { return Err(FileError::new("conflict", "Symbolic link reload is unavailable")); }
        app.state::<FileAccess>().refresh_selected(Path::new(&path))?;
        fingerprint(Path::new(&path))
    }).await.map_err(|e| FileError::new("unknown", e.to_string()))?
}
fn failure(e: std::io::Error) -> FileError {
    let code = match e.raw_os_error() { Some(32) | Some(33) => "locked", Some(112) | Some(28) => "diskFull", _ => if e.kind() == std::io::ErrorKind::PermissionDenied { "permissionDenied" } else { "unknown" } };
    FileError::new(code, e.to_string())
}
pub fn fingerprint(path: &Path) -> Result<String, FileError> {
    let mut file = fs::File::open(path).map_err(failure)?;
    let metadata = file.metadata().map_err(failure)?;
    if metadata.len() > 2 * 1024 * 1024 { return Err(FileError::new("limit", "File exceeds safe edit limit.")); }
    let mut bytes = Vec::new(); file.read_to_end(&mut bytes).map_err(failure)?;
    use sha2::{Digest, Sha256};
    Ok(format!("{:?}:{}:{:x}", metadata.modified().ok(), metadata.len(), Sha256::digest(&bytes)))
}
pub fn atomic_write(path: &Path, bytes: &[u8], expected: Option<&str>) -> Result<String, FileError> {
    atomic_write_with(path, bytes, expected, |temp, bytes| temp.write_all(bytes))
}
fn atomic_write_with(path: &Path, bytes: &[u8], expected: Option<&str>, write: impl FnOnce(&mut tempfile::NamedTempFile, &[u8]) -> std::io::Result<()>) -> Result<String, FileError> {
    if bytes.len() > 2 * 1024 * 1024 { return Err(FileError::new("limit", "File exceeds safe edit limit.")); }
    if fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false) { return Err(FileError::new("conflict", "Symbolic links cannot be replaced.")); }
    let permissions = if path.exists() {
        if expected != Some(fingerprint(path)?.as_str()) { return Err(FileError::new("conflict", "File changed externally. Use Save As or reload.")); }
        let p = fs::metadata(path).map_err(failure)?.permissions();
        if p.readonly() { return Err(FileError::new("permissionDenied", "File is read-only.")); } Some(p)
    } else { if expected.is_some() { return Err(FileError::new("conflict", "Source was deleted.")); } None };
    let identity = if expected.is_some() { Some(same_file::Handle::from_file(fs::File::open(path).map_err(failure)?).map_err(failure)?) } else { None };
    let parent = path.parent().ok_or_else(|| FileError::new("unknown", "Missing parent directory."))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(failure)?;
    write(&mut temp, bytes).map_err(failure)?;
    if let Some(p) = permissions { temp.as_file().set_permissions(p).map_err(failure)?; }
    temp.as_file().sync_all().map_err(failure)?;
    if let Some(expected) = expected { if fingerprint(path)? != expected { return Err(FileError::new("conflict", "File changed during save.")); } }
    if fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false) { return Err(FileError::new("conflict", "Source became a symbolic link during save.")); }
    if let Some(identity) = identity { let current = same_file::Handle::from_file(fs::File::open(path).map_err(failure)?).map_err(failure)?; if identity != current { return Err(FileError::new("conflict", "Source identity changed during save.")); } }
    if expected.is_none() { temp.persist_noclobber(path).map_err(|e| failure(e.error))?; }
    else {
        #[cfg(windows)] {
            use std::os::windows::ffi::OsStrExt;
            let temp_path = temp.into_temp_path();
            let original: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let replacement: Vec<u16> = temp_path.as_os_str().encode_wide().chain(Some(0)).collect();
            let success = unsafe { windows_sys::Win32::Storage::FileSystem::ReplaceFileW(original.as_ptr(), replacement.as_ptr(), std::ptr::null(), 0, std::ptr::null(), std::ptr::null()) };
            if success == 0 { let mut error = failure(std::io::Error::last_os_error()); error.message = format!("Atomic replace failed: {}", error.message); return Err(error); }
        }
        #[cfg(not(windows))] temp.persist(path).map_err(|e| failure(e.error))?;
    }
    #[cfg(unix)] fs::File::open(parent).and_then(|f| f.sync_all()).map_err(failure)?;
    fingerprint(path)
}
#[tauri::command]
pub async fn document_fingerprint(app: tauri::AppHandle, path: String) -> Result<String, FileError> {
    tauri::async_runtime::spawn_blocking(move || { let path = app.state::<FileAccess>().authorized_path(Path::new(&path))?; fingerprint(&path) }).await.map_err(|e| FileError::new("unknown", e.to_string()))?
}
#[derive(serde::Serialize)]
pub struct SaveResult { path: String, fingerprint: String }
fn reject_protected_target(target: &Path, paths: &[String]) -> Result<(), FileError> {
    if paths.len() > 128 { return Err(FileError::new("limit", "Too many protected documents.")); }
    let identity = target.canonicalize().ok();
    if identity.is_some() && paths.iter().any(|path| Path::new(path).canonicalize().ok() == identity) {
        return Err(FileError::new("conflict", "Another open document has unsaved changes at this path."));
    }
    Ok(())
}
#[tauri::command]
pub async fn document_save(app: tauri::AppHandle, path: Option<String>, bytes: Vec<u8>, expected: Option<String>, name: String, protected_paths: Option<Vec<String>>) -> Result<Option<SaveResult>, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let (target, expected) = match path {
            Some(path) => {
                if expected.is_none() || fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false) { return Err(FileError::new("conflict", "Source identity is unavailable or a symbolic link.")); }
                let authorized = app.state::<FileAccess>().authorized_path(Path::new(&path)).map_err(|e| FileError::new("conflict", e.message))?;
                (authorized, expected)
            },
            None => { let Some(picked) = app.dialog().file().set_file_name(&name).blocking_save_file() else { return Ok(None); };
                let target = picked.into_path().map_err(|e| FileError::new("unknown", e.to_string()))?;
                let expected = if target.exists() { Some(fingerprint(&target)?) } else { None }; (target, expected) }
        };
        reject_protected_target(&target, protected_paths.as_deref().unwrap_or_default())?;
        let fingerprint = atomic_write(&target, &bytes, expected.as_deref())?;
        app.state::<FileAccess>().grant(&target)?;
        Ok(Some(SaveResult { path: target.to_string_lossy().into_owned(), fingerprint }))
    }).await.map_err(|e| FileError::new("unknown", e.to_string()))?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn conflict_preserves_source() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); fs::write(&path, b"old").unwrap(); let base = fingerprint(&path).unwrap(); fs::write(&path, b"external").unwrap(); assert!(atomic_write(&path, b"edit", Some(&base)).is_err()); assert_eq!(fs::read(&path).unwrap(), b"external"); }
    #[test] fn replace_and_create() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); let base = atomic_write(&path, b"old", None).unwrap(); atomic_write(&path, b"new", Some(&base)).unwrap(); assert_eq!(fs::read(&path).unwrap(), b"new"); assert!(atomic_write(&path, b"clobber", None).is_err()); }
    #[test] fn save_with_selected_handle() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); fs::write(&path, b"old").unwrap(); let access = FileAccess::default(); access.grant(&path).unwrap(); let path = access.authorized_path(&path).unwrap(); let base = fingerprint(&path).unwrap(); atomic_write(&path, b"new", Some(&base)).unwrap(); access.grant(&path).unwrap(); assert_eq!(access.read_range(&path, 0, 3).unwrap(), b"new"); }
    #[test] fn failed_temp_write_preserves_original() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); fs::write(&path, b"original").unwrap(); let base = fingerprint(&path).unwrap(); let result = atomic_write_with(&path, b"edited", Some(&base), |temp, _| { temp.write_all(b"partial")?; Err(std::io::Error::other("mock write failure")) }); assert!(result.is_err()); assert_eq!(fs::read(&path).unwrap(), b"original"); assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1); }
    #[test] fn disk_full_preserves_original() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); fs::write(&path, b"original").unwrap(); let base = fingerprint(&path).unwrap(); let result = atomic_write_with(&path, b"edited", Some(&base), |_, _| Err(std::io::Error::from_raw_os_error(if cfg!(windows) {112} else {28}))); assert_eq!(result.unwrap_err().code, "diskFull"); assert_eq!(fs::read(&path).unwrap(), b"original"); }
    #[test] fn deleted_source_is_conflict() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); assert_eq!(atomic_write(&path, b"edited", Some("old")).unwrap_err().code, "conflict"); assert!(!path.exists()); }
    #[test] fn readonly_preserves_original() { let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); fs::write(&path, b"original").unwrap(); let base = fingerprint(&path).unwrap(); let mut permissions = fs::metadata(&path).unwrap().permissions(); permissions.set_readonly(true); fs::set_permissions(&path, permissions).unwrap(); assert_eq!(atomic_write(&path, b"edited", Some(&base)).unwrap_err().code, "permissionDenied"); assert_eq!(fs::read(&path).unwrap(), b"original"); let mut permissions = fs::metadata(&path).unwrap().permissions(); permissions.set_readonly(false); fs::set_permissions(&path, permissions).unwrap(); }
    #[cfg(windows)] #[test] fn locked_source_preserves_original() { use std::os::windows::fs::OpenOptionsExt; let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("a.txt"); fs::write(&path, b"original").unwrap(); let base = fingerprint(&path).unwrap(); let lock = fs::OpenOptions::new().read(true).write(true).share_mode(0).open(&path).unwrap(); assert_eq!(atomic_write(&path, b"edited", Some(&base)).unwrap_err().code, "locked"); drop(lock); assert_eq!(fs::read(&path).unwrap(), b"original"); }
    #[cfg(unix)] #[test] fn execute_permission_preserved() { use std::os::unix::fs::PermissionsExt; let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("script.sh"); fs::write(&path, b"#!/bin/sh\n").unwrap(); fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap(); let base = fingerprint(&path).unwrap(); atomic_write(&path, b"#!/bin/sh\n# edited\n", Some(&base)).unwrap(); assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o755); }
}

#[cfg(test)] mod workspace_save_tests {
    use super::*;
    #[test] fn another_dirty_document_is_protected_without_writing() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("draft.txt");
        fs::write(&path, b"original").unwrap();
        assert!(reject_protected_target(&path, &[path.to_string_lossy().into_owned()]).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert!(reject_protected_target(&path, &[]).is_ok());
        assert!(reject_protected_target(&dir.path().join("new.txt"), &[]).is_ok());
    }
}
