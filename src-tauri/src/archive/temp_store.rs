//! Only UUID directories created inside Prism's private cache are recoverable.
use super::*;
use std::ops::{Deref, DerefMut};
pub struct OwnedTemp {
    file: NamedTempFile,
    _lock: File,
    _dir: tempfile::TempDir,
}
impl Deref for OwnedTemp {
    type Target = NamedTempFile;
    fn deref(&self) -> &NamedTempFile {
        &self.file
    }
}
impl DerefMut for OwnedTemp {
    fn deref_mut(&mut self) -> &mut NamedTempFile {
        &mut self.file
    }
}
fn root() -> PathBuf {
    std::env::temp_dir().join("Prism-owned-vfs-v1")
}
pub fn create() -> Result<OwnedTemp, FileError> {
    let root = root();
    std::fs::create_dir_all(&root).map_err(ioerr)?;
    if std::fs::symlink_metadata(&root)
        .map_err(ioerr)?
        .file_type()
        .is_symlink()
    {
        return Err(err("UNSAFE_PATH", "Temporary cache root is a link"));
    }
    let dir = tempfile::Builder::new()
        .prefix("session-")
        .tempdir_in(&root)
        .map_err(ioerr)?;
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.path().join("owner.lock"))
        .map_err(ioerr)?;
    lock.lock().map_err(ioerr)?;
    std::fs::write(dir.path().join("owner.marker"), b"Prism VFS owned cache v1").map_err(ioerr)?;
    let file = tempfile::Builder::new()
        .prefix("entry-")
        .tempfile_in(dir.path())
        .map_err(ioerr)?;
    Ok(OwnedTemp {
        file,
        _lock: lock,
        _dir: dir,
    })
}
pub fn recover() {
    let root = root();
    let Ok(meta) = std::fs::symlink_metadata(&root) else {
        return;
    };
    if meta.file_type().is_symlink() {
        return;
    }
    let Ok(items) = std::fs::read_dir(&root) else {
        return;
    };
    for item in items.take(1000).flatten() {
        let path = item.path();
        if !item.file_name().to_string_lossy().starts_with("session-") {
            continue;
        }
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if !meta.is_dir() || meta.file_type().is_symlink() {
            continue;
        }
        let marker = path.join("owner.marker");
        if std::fs::symlink_metadata(&marker).is_ok_and(|m| m.file_type().is_symlink()) {
            continue;
        }
        if std::fs::read(&marker).ok().as_deref() != Some(b"Prism VFS owned cache v1") {
            continue;
        }
        if meta
            .modified()
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_none_or(|age| age.as_secs() < 7 * 86400)
        {
            continue;
        }
        let lockpath = path.join("owner.lock");
        if std::fs::symlink_metadata(&lockpath).is_ok_and(|m| m.file_type().is_symlink()) {
            continue;
        }
        let Ok(lock) = std::fs::OpenOptions::new().write(true).open(lockpath) else {
            continue;
        };
        if lock.try_lock().is_err() {
            continue;
        }
        // Refuse any linked member before recursive removal of an old, unlocked owned directory.
        let Ok(children) = std::fs::read_dir(&path) else {
            continue;
        };
        if children.flatten().any(|p| {
            p.file_type()
                .map_or(true, |kind| kind.is_symlink() || kind.is_dir())
        }) {
            continue;
        }
        let _ = std::fs::remove_dir_all(&path);
    }
}
