use crate::detection::{
    self,
    descriptor::{DetectionSource, FileDescriptor, FileType, Warning},
    ooxml::ArchiveKind,
};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
pub const SAMPLE_LIMIT: usize = 65536;
#[derive(Debug, Serialize)]
pub struct FileError {
    pub code: &'static str,
    pub message: String,
}
impl FileError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
fn io_error(e: std::io::Error) -> FileError {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => "FILE_NOT_FOUND",
        std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
        _ => "READ_FAILED",
    };
    eprintln!("Prism file I/O: {e:?}");
    FileError::new(
        code,
        match code {
            "FILE_NOT_FOUND" => "The selected file no longer exists.",
            "PERMISSION_DENIED" => "Permission to read this file was denied.",
            _ => "The selected file could not be read.",
        },
    )
}

pub fn canonical_file(path: &Path) -> Result<PathBuf, FileError> {
    let raw = path.to_string_lossy();
    if !path.is_absolute()
        || raw.contains('\0')
        || raw.starts_with("\\\\.\\")
        || raw.to_ascii_lowercase().starts_with("\\\\?\\globalroot")
    {
        return Err(FileError::new(
            "UNSUPPORTED_PATH",
            "Select an absolute path to a regular file.",
        ));
    }
    let resolved = path.canonicalize().map_err(io_error)?;
    if !resolved.metadata().map_err(io_error)?.is_file() {
        return Err(FileError::new(
            "NOT_A_FILE",
            "This path is a folder or a special device, not a regular file.",
        ));
    }
    Ok(resolved)
}
// Hold the selected file handle, rather than reopening a mutable/symlink path at read time.
// This pins the user-authorized object across path replacement and symlink retargeting.
#[derive(Default)]
pub struct FileAccess {
    grants: Mutex<Grants>,
}
#[derive(Default)]
struct Grants {
    files: HashMap<PathBuf, File>,
    order: VecDeque<PathBuf>,
}
impl FileAccess {
    /// Explicit user reload accepts a replaced file only at a previously selected canonical path.
    pub fn refresh_selected(&self, path: &Path) -> Result<(), FileError> {
        let canonical = canonical_file(path)?;
        let grants = self.grants.lock().map_err(|_| FileError::new("READ_FAILED", "File access unavailable"))?;
        if !grants.files.contains_key(&canonical) { return Err(FileError::new("PERMISSION_DENIED", "Choose this file first")); }
        drop(grants);
        self.grant(&canonical)
    }
    pub fn grant(&self, path: &Path) -> Result<(), FileError> {
        let path = canonical_file(path)?;
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(windows)] {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0x1 | 0x2 | 0x4);
        }
        let file = options.open(&path).map_err(io_error)?;
        if !file.metadata().map_err(io_error)?.is_file() {
            return Err(FileError::new(
                "NOT_A_FILE",
                "Only regular files can be inspected.",
            ));
        }
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access state is unavailable."))?;
        grants.order.retain(|existing| existing != &path);
        if !grants.files.contains_key(&path) && grants.files.len() >= 128 {
            if let Some(oldest) = grants.order.pop_front() {
                grants.files.remove(&oldest);
            }
        }
        grants.order.push_back(path.clone());
        grants.files.insert(path, file);
        Ok(())
    }
    // All content access uses the same selected, pinned handles as descriptor loading.
    pub fn read_range(&self, path: &Path, offset: u64, length: u64) -> Result<Vec<u8>, FileError> {
        use std::io::{Seek, SeekFrom};
        if length > 1024 * 1024 || offset.checked_add(length).is_none() {
            return Err(FileError::new(
                "READ_FAILED",
                "Invalid range or range exceeds 1 MiB.",
            ));
        }
        let canonical = canonical_file(path)?;
        let grants = self
            .grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access state is unavailable."))?;
        let mut file = grants
            .files
            .get(&canonical)
            .ok_or_else(|| FileError::new("PERMISSION_DENIED", "Choose this file in Prism first."))?
            .try_clone()
            .map_err(io_error)?;
        file.seek(SeekFrom::Start(offset)).map_err(io_error)?;
        let mut bytes = Vec::with_capacity(length as usize);
        file.take(length)
            .read_to_end(&mut bytes)
            .map_err(io_error)?;
        Ok(bytes)
    }
    pub fn size(&self, path: &Path) -> Result<u64, FileError> {
        let canonical = canonical_file(path)?;
        let grants = self
            .grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access state is unavailable."))?;
        Ok(grants
            .files
            .get(&canonical)
            .ok_or_else(|| FileError::new("PERMISSION_DENIED", "Choose this file in Prism first."))?
            .metadata()
            .map_err(io_error)?
            .len())
    }
    pub fn revision(&self, path: &Path) -> Result<String, FileError> {
        let canonical = canonical_file(path)?;
        let grants = self
            .grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access state is unavailable."))?;
        let file = grants.files.get(&canonical).ok_or_else(|| {
            FileError::new("PERMISSION_DENIED", "Choose this file in Prism first.")
        })?;
        let metadata = file.metadata().map_err(io_error)?;
        Ok(format!("{}:{:?}", metadata.len(), metadata.modified().ok()))
    }
    pub fn load_related(&self, base: &Path, relative: &str) -> Result<FileDescriptor, FileError> {
        use std::path::Component;
        let base = self.authorized_path(base)?;
        let relative_path = Path::new(relative);
        if relative.is_empty()
            || relative.contains('\\')
            || relative.contains(':')
            || relative_path
                .components()
                .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
        {
            return Err(FileError::new(
                "UNSUPPORTED_PATH",
                "Only files inside the selected document directory can be opened.",
            ));
        }
        let directory = base
            .parent()
            .ok_or_else(|| FileError::new("UNSUPPORTED_PATH", "Document directory unavailable."))?;
        let child = canonical_file(&directory.join(relative_path))?;
        if !child.starts_with(directory) {
            return Err(FileError::new(
                "PERMISSION_DENIED",
                "Related files cannot escape the document directory.",
            ));
        }
        self.grant(&child)?;
        self.load(&child)
    }
    pub fn authorized_file(&self, path: &Path) -> Result<File, FileError> {
        let canonical = self.authorized_path(path)?;
        self.grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access unavailable"))?
            .files
            .get(&canonical)
            .ok_or_else(|| FileError::new("PERMISSION_DENIED", "Choose this file in Prism first"))?
            .try_clone()
            .map_err(io_error)
    }
    pub fn authorized_path(&self, path: &Path) -> Result<PathBuf, FileError> {
        let canonical = canonical_file(path)?;
        let grants = self
            .grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access state is unavailable."))?;
        let pinned = grants.files.get(&canonical).ok_or_else(|| {
            FileError::new("PERMISSION_DENIED", "Choose this file in Prism first.")
        })?;
        // External applications reopen paths. Reject observable replacement before handing off.
        let selected = same_file::Handle::from_file(pinned.try_clone().map_err(io_error)?)
            .map_err(io_error)?;
        let current = same_file::Handle::from_path(&canonical).map_err(io_error)?;
        if selected != current {
            return Err(FileError::new(
                "PERMISSION_DENIED",
                "The file changed. Select it again before opening externally.",
            ));
        }
        Ok(canonical)
    }
    pub fn load(&self, path: &Path) -> Result<FileDescriptor, FileError> {
        let canonical = canonical_file(path)?;
        let grants = self
            .grants
            .lock()
            .map_err(|_| FileError::new("READ_FAILED", "File access state is unavailable."))?;
        let file = grants
            .files
            .get(&canonical)
            .ok_or_else(|| {
                FileError::new(
                    "PERMISSION_DENIED",
                    "Choose this file in the native dialog or drop it into Prism first.",
                )
            })?
            .try_clone()
            .map_err(io_error)?;
        let result = load_handle(file, &canonical);
        drop(grants);
        result
    }
}
fn millis(time: std::io::Result<SystemTime>) -> Option<u64> {
    time.ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|t| t.as_millis() as u64)
}
pub fn load_handle(mut file: File, path: &Path) -> Result<FileDescriptor, FileError> {
    use std::io::{Seek, SeekFrom};
    file.seek(SeekFrom::Start(0)).map_err(io_error)?;
    let metadata = file.metadata().map_err(io_error)?;
    if !metadata.is_file() {
        return Err(FileError::new(
            "NOT_A_FILE",
            "Only regular files can be inspected.",
        ));
    }
    let mut sample = Vec::with_capacity(SAMPLE_LIMIT);
    (&mut file)
        .take(SAMPLE_LIMIT as u64)
        .read_to_end(&mut sample)
        .map_err(io_error)?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| FileError::new("UNSUPPORTED_PATH", "The file name is not valid Unicode."))?;
    let mut descriptor = detection::detect(name, &sample, metadata.len());
    descriptor.path = Some(path.to_string_lossy().into_owned());
    descriptor.modified_at = millis(metadata.modified());
    descriptor.created_at = millis(metadata.created());
    if descriptor.detected_type == FileType::Zip {
        let archive =
            detection::ooxml::inspect(&mut file, metadata.len(), &mut descriptor.bytes_read)
                .map_err(io_error)?;
        let subtype_checked = matches!(
            archive,
            ArchiveKind::Xlsx
                | ArchiveKind::Xlsm
                | ArchiveKind::Pptx
                | ArchiveKind::Pptm
                | ArchiveKind::Ods
                | ArchiveKind::Odp
                | ArchiveKind::Docx
                | ArchiveKind::Odt
                | ArchiveKind::Zip
                | ArchiveKind::UsdPackage
        );
        match archive {
            ArchiveKind::Epub => {
                descriptor.detected_type = FileType::Epub;
                descriptor.mime_type = Some(FileType::Epub.mime().into());
                descriptor.detection_source.push(DetectionSource::Content);
            }
            ArchiveKind::Docx | ArchiveKind::Odt => {
                descriptor.detected_type = if archive == ArchiveKind::Docx {
                    FileType::Docx
                } else {
                    FileType::Odt
                };
                descriptor.mime_type = Some(descriptor.detected_type.mime().into());
                descriptor.detection_source.push(DetectionSource::Content);
            }
            ArchiveKind::Xlsx
            | ArchiveKind::Xlsm
            | ArchiveKind::Pptx
            | ArchiveKind::Pptm
            | ArchiveKind::Ods
            | ArchiveKind::Odp => {
                descriptor.detected_type = match archive {
                    ArchiveKind::Xlsm => FileType::Xlsm,
                    ArchiveKind::Pptm => FileType::Pptm,
                    ArchiveKind::Pptx => match descriptor.extension.as_deref() {
                        Some("ppsx") => FileType::Ppsx,
                        Some("potx") => FileType::Potx,
                        _ => FileType::Pptx,
                    },
                    ArchiveKind::Ods => FileType::Ods,
                    ArchiveKind::Odp => FileType::Odp,
                    _ => FileType::Xlsx,
                };
                descriptor.mime_type = Some(descriptor.detected_type.mime().into());
                descriptor.detection_source.push(DetectionSource::Content);
            }
            ArchiveKind::Corrupt => descriptor
                .warnings
                .push(Warning::new("CORRUPTED_SIGNATURE")),
            ArchiveKind::Limited => descriptor
                .warnings
                .push(Warning::new("ARCHIVE_INSPECTION_LIMIT")),
            ArchiveKind::UsdPackage => {
                if descriptor.extension.as_deref() == Some("usdz") {
                    descriptor.detected_type = FileType::Usdz;
                    descriptor.mime_type = Some("model/vnd.usdz+zip".into());
                    descriptor.detection_source.push(DetectionSource::Content);
                }
            }
            ArchiveKind::Zip => {}
        }
        // Recompute mismatch after the container subtype is resolved.
        descriptor
            .warnings
            .retain(|w| w.code != "EXTENSION_MISMATCH");
        descriptor
            .detection_source
            .retain(|s| *s != DetectionSource::Extension);
        if let Some(expected) = descriptor
            .extension
            .as_deref()
            .and_then(detection::extension::from_extension)
        {
            if expected != descriptor.detected_type
                && !(matches!(expected, FileType::Xlsx | FileType::Docx | FileType::Odt)
                    && !subtype_checked)
            {
                descriptor.warnings.push(Warning {
                    code: "EXTENSION_MISMATCH",
                    expected: Some(expected),
                    detected: Some(descriptor.detected_type),
                });
            } else if expected == descriptor.detected_type {
                descriptor.detection_source.push(DetectionSource::Extension);
            }
        }
    }
    let after = file.metadata().map_err(io_error)?;
    if after.len() != metadata.len() || after.modified().ok() != metadata.modified().ok() {
        descriptor.warnings.push(Warning::new("FILE_CHANGED"));
    }
    Ok(descriptor)
}
