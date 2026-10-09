use crate::file_io::{FileAccess, FileError};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tempfile::NamedTempFile;
pub mod commands;
pub mod extract;
pub(crate) mod temp_store;
mod zip_directory;
pub const ENTRY_LIMIT: usize = 120_000;
pub const PATH_BYTES: usize = 4096;
pub const PATH_DEPTH: usize = 64;
pub const METADATA_LIMIT: u64 = 64 * 1024 * 1024;
pub const ENTRY_BYTES: u64 = 1024 * 1024 * 1024;
pub const EXPANDED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const MEMORY_BYTES: u64 = 32 * 1024 * 1024;
pub const DEPTH_LIMIT: u8 = 8;
pub fn err(code: &'static str, message: impl Into<String>) -> FileError {
    FileError::new(code, message)
}
pub fn ioerr(e: io::Error) -> FileError {
    let code = match e.kind() {
        io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
        io::ErrorKind::StorageFull => "DISK_FULL",
        io::ErrorKind::AlreadyExists => "EXTRACTION_CONFLICT",
        _ => "ARCHIVE_IO",
    };
    err(code, e.to_string())
}
pub fn virtual_path(raw: &str) -> Result<String, FileError> {
    if raw.len() > PATH_BYTES
        || raw.is_empty()
        || raw.starts_with('/')
        || raw.contains('\\')
        || raw.contains(':')
        || raw.chars().any(|c| c.is_control())
    {
        return Err(err("UNSAFE_PATH", "Unsafe archive path"));
    }
    let path = raw.trim_end_matches('/');
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() > PATH_DEPTH
        || parts
            .iter()
            .any(|p| p.is_empty() || *p == "." || *p == "..")
    {
        return Err(err(
            "UNSAFE_PATH",
            "Unsafe or excessively deep archive path",
        ));
    }
    let lower = path.to_ascii_lowercase();
    if ["%2e", "%2f", "%5c", "%3a", "%00"]
        .iter()
        .any(|s| lower.contains(s))
    {
        return Err(err("UNSAFE_PATH", "Ambiguous encoded archive path"));
    }
    Ok(path.into())
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: usize,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub compressed_size: Option<u64>,
    pub modified: Option<u64>,
    pub crc: Option<u32>,
    pub method: String,
    pub encrypted: bool,
    pub link_target: Option<String>,
    pub attributes: Option<String>,
    pub offset: u64,
    pub unsafe_reason: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub list: bool,
    pub read: bool,
    pub extract: bool,
    pub password: bool,
    pub streaming: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub format: String,
    pub size: u64,
    pub encrypted: bool,
    pub comment: Option<String>,
    pub diagnostics: Vec<String>,
    pub complete: bool,
    pub entries: usize,
    pub capabilities: Capabilities,
    pub error: Option<String>,
}
pub enum Data {
    Overlay {
        source: Arc<Data>,
        at: u64,
        bytes: Vec<u8>,
    },
    Slice {
        source: Arc<Data>,
        offset: u64,
        size: u64,
    },
    Memory(Vec<u8>),
    Disk {
        file: File,
        size: u64,
        _owner: Option<temp_store::OwnedTemp>,
    },
}
impl Data {
    pub fn size(&self) -> u64 {
        match self {
            Self::Overlay { at, bytes, .. } => at + bytes.len() as u64,
            Self::Slice { size, .. } => *size,
            Self::Memory(b) => b.len() as u64,
            Self::Disk { size, .. } => *size,
        }
    }
    pub fn read_at(&self, offset: u64, length: usize) -> io::Result<Vec<u8>> {
        if offset > self.size() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid range"));
        }
        let length = length.min((self.size() - offset) as usize);
        match self {
            Self::Overlay { source, at, bytes } => {
                let mut output = Vec::with_capacity(length);
                if offset < *at {
                    output = source.read_at(offset, length.min((*at - offset) as usize))?;
                }
                if offset + length as u64 > *at {
                    let start = offset.saturating_sub(*at) as usize;
                    let n = length - output.len();
                    output.extend_from_slice(&bytes[start..start + n]);
                }
                Ok(output)
            }
            Self::Slice {
                source,
                offset: base,
                ..
            } => source.read_at(base + offset, length),
            Self::Memory(b) => Ok(b[offset as usize..offset as usize + length].to_vec()),
            Self::Disk { file, .. } => {
                let mut bytes = vec![0; length];
                let mut got = 0;
                while got < length {
                    #[cfg(windows)]
                    let n = {
                        use std::os::windows::fs::FileExt;
                        file.seek_read(&mut bytes[got..], offset + got as u64)?
                    };
                    #[cfg(unix)]
                    let n = {
                        use std::os::unix::fs::FileExt;
                        file.read_at(&mut bytes[got..], offset + got as u64)?
                    };
                    if n == 0 {
                        break;
                    }
                    got += n
                }
                bytes.truncate(got);
                Ok(bytes)
            }
        }
    }
}
#[derive(Clone)]
pub struct Reader {
    data: Arc<Data>,
    position: u64,
}
impl Reader {
    pub fn new(data: Arc<Data>) -> Self {
        Self { data, position: 0 }
    }
}
impl Read for Reader {
    fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
        let bytes = self.data.read_at(self.position, b.len())?;
        b[..bytes.len()].copy_from_slice(&bytes);
        self.position += bytes.len() as u64;
        Ok(bytes.len())
    }
}
impl Seek for Reader {
    fn seek(&mut self, p: SeekFrom) -> io::Result<u64> {
        let value = match p {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::Current(n) => self.position as i128 + n as i128,
            SeekFrom::End(n) => self.data.size() as i128 + n as i128,
        };
        if value < 0 || value > u64::MAX as i128 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid seek"));
        }
        self.position = value as u64;
        Ok(self.position)
    }
}
pub struct Session {
    pub id: String,
    pub depth: u8,
    pub data: Mutex<Arc<Data>>,
    pub entries: Mutex<Vec<Entry>>,
    pub info: Mutex<Info>,
    pub cancelled: AtomicBool,
    pub cache: Mutex<HashMap<usize, Arc<Data>>>,
    pub chain_bytes: u64,
    pub zip_records: Mutex<Option<(u64, Vec<Vec<u8>>)>>,
    pub pins: Mutex<HashMap<usize, usize>>,
}
impl Session {
    fn check(&self) -> Result<(), FileError> {
        if self.cancelled.load(Ordering::Relaxed) {
            Err(err("CANCELLED", "Cancelled"))
        } else {
            Ok(())
        }
    }
    pub fn entry(&self, id: usize) -> Result<Entry, FileError> {
        self.entries
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| err("ENTRY_UNAVAILABLE", "Entry is unavailable"))
    }
    fn add(&self, mut e: Entry) -> Result<(), FileError> {
        self.check()?;
        let mut entries = self.entries.lock().unwrap();
        if entries.len() >= ENTRY_LIMIT {
            return Err(err("SAFETY_LIMIT", "Safety limit reached: entry count"));
        }
        if e.path.len() > PATH_BYTES {
            return Err(err("SAFETY_LIMIT", "Safety limit reached: filename length"));
        }
        e.id = entries.len();
        if let Err(error) = virtual_path(&e.path) {
            e.unsafe_reason = Some(error.message)
        }
        if e.size > ENTRY_BYTES
            || e.size > 64 * 1024 * 1024
                && e.size / e.compressed_size.unwrap_or(e.size).max(1) > 1000
        {
            e.unsafe_reason = Some("Safety limit reached: expanded entry / compression risk".into())
        }
        let encrypted = e.encrypted;
        let unsafe_entry = e.unsafe_reason.is_some();
        entries.push(e);
        let mut info = self.info.lock().unwrap();
        info.entries = entries.len();
        info.encrypted |= encrypted;
        if unsafe_entry && info.diagnostics.len() < 100 {
            info.diagnostics.push(format!(
                "Unsafe entry #{} cannot be opened or extracted",
                entries.len() - 1
            ))
        }
        Ok(())
    }
    fn index(&self, name: &str) -> Result<(), FileError> {
        let initial = self.data.lock().unwrap().clone();
        let head = initial.read_at(0, 512).map_err(ioerr)?;
        if head.starts_with(&[31, 139]) {
            self.info.lock().unwrap().format = "GZIP".into();
            let decoder = flate2::read::MultiGzDecoder::new(Reader::new(initial));
            let data = materialize(decoder, None, self, ENTRY_BYTES)?;
            let bytes = data.read_at(0, 512).map_err(ioerr)?;
            *self.data.lock().unwrap() = data.clone();
            if bytes.get(257..262) == Some(b"ustar")
                || name.to_ascii_lowercase().ends_with(".tgz")
                || name.to_ascii_lowercase().ends_with(".tar.gz")
            {
                self.info.lock().unwrap().format = "TGZ".into();
                self.index_tar(data)?;
            } else {
                let path = name.strip_suffix(".gz").unwrap_or("content").to_string();
                self.add(Entry {
                    path,
                    kind: "file".into(),
                    size: data.size(),
                    method: "GZIP".into(),
                    ..Default::default()
                })?;
            }
        } else if head.starts_with(b"PK") {
            self.info.lock().unwrap().format = "ZIP".into();
            self.index_zip(initial)?;
        } else if head.get(257..262) == Some(b"ustar")
            || name.to_ascii_lowercase().ends_with(".tar")
        {
            self.info.lock().unwrap().format = "TAR".into();
            self.index_tar(initial)?;
        } else {
            let format = if head.starts_with(b"7z\xbc\xaf\x27\x1c") {
                "7z"
            } else if head.starts_with(b"Rar!\x1a\x07") {
                "RAR"
            } else if head.starts_with(b"BZh") {
                "BZ2"
            } else if head.starts_with(b"\xfd7zXZ\0") {
                "XZ"
            } else if head.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
                "ZST"
            } else {
                "Unknown"
            };
            let mut info = self.info.lock().unwrap();
            info.format = format.into();
            info.error=Some(format!("{format} — Limited support. Listing, decryption and extraction are unavailable with this backend."));
            info.capabilities = Capabilities {
                list: false,
                read: false,
                extract: false,
                password: false,
                streaming: false,
            };
        }
        Ok(())
    }
    fn index_zip(&self, data: Arc<Data>) -> Result<(), FileError> {
        zip_directory::index(self, data)
    }
    fn index_tar(&self, data: Arc<Data>) -> Result<(), FileError> {
        // Check extension lengths before tar-rs can allocate a GNU/PAX extension body.
        let mut scan = tar::Archive::new(Reader::new(data.clone()));
        let mut extensions = 0u64;
        let mut headers = 0usize;
        for item in scan.entries_with_seek().map_err(ioerr)?.raw(true) {
            self.check()?;
            let entry = item.map_err(ioerr)?;
            headers += 1;
            if headers > ENTRY_LIMIT * 2 {
                return Err(err("SAFETY_LIMIT", "TAR header budget reached"));
            }
            let kind = entry.header().entry_type();
            if kind.is_gnu_longname()
                || kind.is_gnu_longlink()
                || kind.is_pax_local_extensions()
                || kind.is_pax_global_extensions()
            {
                extensions = extensions.saturating_add(entry.size());
                if entry.size() > PATH_BYTES as u64 * 4 || extensions > METADATA_LIMIT {
                    return Err(err("SAFETY_LIMIT", "TAR extension metadata budget reached"));
                }
            }
            if entry
                .raw_file_position()
                .checked_add(entry.size())
                .is_none_or(|n| n > data.size())
            {
                return Err(err("TRUNCATED_ARCHIVE", "Truncated TAR entry"));
            }
        }
        let mut tar = tar::Archive::new(Reader::new(data));
        let mut metadata = 0;
        for item in tar.entries_with_seek().map_err(ioerr)? {
            self.check()?;
            let entry = item.map_err(ioerr)?;
            let bytes = entry.path_bytes();
            metadata += bytes.len();
            if metadata > METADATA_LIMIT as usize {
                return Err(err("SAFETY_LIMIT", "Safety limit reached: TAR metadata"));
            }
            let kind = entry.header().entry_type();
            self.add(Entry {
                path: String::from_utf8_lossy(&bytes).into_owned(),
                kind: if kind.is_file() {
                    "file"
                } else if kind.is_dir() {
                    "directory"
                } else if kind.is_symlink() {
                    "symlink"
                } else if kind.is_hard_link() {
                    "hardlink"
                } else {
                    "special"
                }
                .into(),
                size: entry.size(),
                modified: entry.header().mtime().ok().map(|n| n * 1000),
                offset: entry.raw_file_position(),
                method: "TAR".into(),
                link_target: entry
                    .link_name_bytes()
                    .map(|b| String::from_utf8_lossy(&b).into_owned()),
                attributes: entry.header().mode().ok().map(|m| format!("{m:o}")),
                ..Default::default()
            })?;
        }
        Ok(())
    }
    pub fn stream(
        &self,
        id: usize,
        password: Option<&str>,
        write: &mut dyn FnMut(&[u8]) -> Result<(), FileError>,
    ) -> Result<(), FileError> {
        let entry = self.entry(id)?;
        if let Some(reason) = entry.unsafe_reason {
            return Err(err("SAFETY_LIMIT", reason));
        }
        if entry.kind != "file" {
            return Err(err(
                "ENTRY_UNAVAILABLE",
                "Links and special files are Inspect only",
            ));
        }
        let data = self.data.lock().unwrap().clone();
        if self.info.lock().unwrap().format == "ZIP" {
            let records = self.zip_records.lock().unwrap();
            let (at, items) = records
                .as_ref()
                .ok_or_else(|| err("INDEXING", "Wait for ZIP indexing"))?;
            let overlay = zip_directory::one(
                data,
                *at,
                items
                    .get(id)
                    .ok_or_else(|| err("ENTRY_UNAVAILABLE", "Entry unavailable"))?,
            );
            drop(records);
            let mut zip = zip::ZipArchive::new(Reader::new(overlay)).map_err(ziperr)?;
            let file = if let Some(password) = password {
                zip.by_index_decrypt(0, password.as_bytes())
                    .map_err(ziperr)?
            } else {
                zip.by_index(0).map_err(ziperr)?
            };
            copy_checked(file, entry.size, self, write)?;
        } else {
            let mut reader = Reader::new(data);
            reader.seek(SeekFrom::Start(entry.offset)).map_err(ioerr)?;
            copy_checked(reader.take(entry.size), entry.size, self, write)?;
        }
        Ok(())
    }
    pub fn prepare(&self, id: usize, password: Option<&str>) -> Result<Arc<Data>, FileError> {
        if let Some(data) = self.cache.lock().unwrap().get(&id).cloned() {
            return Ok(data);
        }
        let entry = self.entry(id)?;
        if entry.kind != "file" || entry.unsafe_reason.is_some() {
            return Err(err(
                "ENTRY_UNAVAILABLE",
                entry
                    .unsafe_reason
                    .unwrap_or("Links and special entries are Inspect only".into()),
            ));
        }
        if entry.size > ENTRY_BYTES {
            return Err(err("SAFETY_LIMIT", "Safety limit reached: entry size"));
        }
        if !entry.encrypted
            && (self.info.lock().unwrap().format != "ZIP" || entry.method == "Stored")
        {
            return Ok(Arc::new(Data::Slice {
                source: self.data.lock().unwrap().clone(),
                offset: entry.offset,
                size: entry.size,
            }));
        }
        let mut memory = Vec::new();
        let mut temp = if entry.size > MEMORY_BYTES {
            Some(owned_temp()?)
        } else {
            None
        };
        self.stream(id, password, &mut |chunk| {
            if let Some(temp) = temp.as_mut() {
                temp.write_all(chunk).map_err(ioerr)
            } else {
                memory.extend_from_slice(chunk);
                Ok(())
            }
        })?;
        let data = Arc::new(if let Some(mut temp) = temp {
            temp.flush().map_err(ioerr)?;
            Data::Disk {
                file: temp.reopen().map_err(ioerr)?,
                size: entry.size,
                _owner: Some(temp),
            }
        } else {
            Data::Memory(memory)
        });
        let mut cache = self.cache.lock().unwrap();
        if cache
            .values()
            .map(|d| d.size().min(MEMORY_BYTES))
            .sum::<u64>()
            + data.size().min(MEMORY_BYTES)
            > 64 * 1024 * 1024
        {
            let pins = self.pins.lock().unwrap();
            cache.retain(|id, _| pins.get(id).copied().unwrap_or(0) > 0);
            if cache
                .values()
                .map(|d| d.size().min(MEMORY_BYTES))
                .sum::<u64>()
                + data.size().min(MEMORY_BYTES)
                > 64 * 1024 * 1024
            {
                return Err(err("SAFETY_LIMIT","Open entry cache budget reached; close an internal file before opening another large entry"));
            }
        }
        cache.insert(id, data.clone());
        Ok(data)
    }
    pub fn read(&self, id: usize, offset: u64, length: usize) -> Result<Vec<u8>, FileError> {
        if length > 1024 * 1024 {
            return Err(err("SAFETY_LIMIT", "Range exceeds 1 MiB"));
        }
        let entry = self.entry(id)?;
        if offset.checked_add(length as u64).is_none() || offset > entry.size {
            return Err(err("ENTRY_UNAVAILABLE", "Invalid entry range"));
        }
        let data = self.cache.lock().unwrap().get(&id).cloned();
        if let Some(data) = data {
            return data.read_at(offset, length).map_err(ioerr);
        }
        let format = self.info.lock().unwrap().format.clone();
        if entry.kind == "file"
            && !entry.encrypted
            && entry.unsafe_reason.is_none()
            && (format != "ZIP" || entry.method == "Stored")
        {
            return self
                .data
                .lock()
                .unwrap()
                .read_at(
                    entry.offset + offset,
                    length.min((entry.size - offset) as usize),
                )
                .map_err(ioerr);
        }
        Err(err(
            "ENTRY_UNAVAILABLE",
            "Prepare this compressed entry before reading",
        ))
    }
}
fn copy_checked(
    mut reader: impl Read,
    size: u64,
    session: &Session,
    write: &mut dyn FnMut(&[u8]) -> Result<(), FileError>,
) -> Result<(), FileError> {
    let mut buf = vec![0; 65536];
    let mut total = 0;
    loop {
        session.check()?;
        let n = reader.read(&mut buf).map_err(ioerr)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > size || total > ENTRY_BYTES {
            return Err(err(
                "SAFETY_LIMIT",
                "Expanded entry exceeds declared size / budget",
            ));
        }
        write(&buf[..n])?;
    }
    if total != size {
        return Err(err(
            "INTEGRITY_FAILED",
            "Integrity check failed: expanded size",
        ));
    }
    Ok(())
}
fn owned_temp() -> Result<temp_store::OwnedTemp, FileError> {
    temp_store::create()
}
fn materialize(
    mut reader: impl Read,
    size: Option<u64>,
    session: &Session,
    limit: u64,
) -> Result<Arc<Data>, FileError> {
    let mut temp = owned_temp()?;
    let mut total = 0;
    let mut buf = vec![0; 65536];
    loop {
        session.check()?;
        let n = reader.read(&mut buf).map_err(ioerr)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > limit || total + session.chain_bytes > EXPANDED_BYTES {
            return Err(err(
                "SAFETY_LIMIT",
                "Safety limit reached: compression layer",
            ));
        }
        temp.write_all(&buf[..n]).map_err(ioerr)?;
    }
    if size.is_some_and(|n| n != total) {
        return Err(err("INTEGRITY_FAILED", "Integrity check failed"));
    }
    Ok(Arc::new(Data::Disk {
        file: temp.reopen().map_err(ioerr)?,
        size: total,
        _owner: Some(temp),
    }))
}
fn ziperr(e: zip::result::ZipError) -> FileError {
    let text = e.to_string();
    let lower = text.to_lowercase();
    let code = if lower.contains("password") {
        if lower.contains("invalid") || lower.contains("incorrect") {
            "INCORRECT_PASSWORD"
        } else {
            "PASSWORD_REQUIRED"
        }
    } else if lower.contains("unsupported") || lower.contains("compression") {
        "UNSUPPORTED_COMPRESSION"
    } else {
        "MALFORMED_ARCHIVE"
    };
    err(
        code,
        if code == "INCORRECT_PASSWORD" {
            "Incorrect password".into()
        } else if code == "PASSWORD_REQUIRED" {
            "Password required".into()
        } else {
            text
        },
    )
}
fn preflight_zip(data: &Arc<Data>) -> Result<(), FileError> {
    let size = data.size();
    let tail = data
        .read_at(size.saturating_sub(65557), size.min(65557) as usize)
        .map_err(ioerr)?;
    let mut found = None;
    for n in (0..tail.len().saturating_sub(21)).rev() {
        if tail.get(n..n + 4) == Some(b"PK\x05\x06")
            && n + 22 + u16::from_le_bytes(tail[n + 20..n + 22].try_into().unwrap()) as usize
                == tail.len()
        {
            found = Some(n);
            break;
        }
    }
    let n = found.ok_or_else(|| {
        err(
            "TRUNCATED_ARCHIVE",
            "Truncated or malformed ZIP central directory",
        )
    })?;
    let count = u16::from_le_bytes(tail[n + 10..n + 12].try_into().unwrap()) as u64;
    let mut metadata = u32::from_le_bytes(tail[n + 12..n + 16].try_into().unwrap()) as u64;
    let mut total = count;
    if count == 65535 || metadata == u32::MAX as u64 {
        let end = size - tail.len() as u64 + n as u64;
        if end < 20 {
            return Err(err("MALFORMED_ARCHIVE", "Missing ZIP64 locator"));
        }
        let locator = data.read_at(end - 20, 20).map_err(ioerr)?;
        if locator.get(..4) != Some(b"PK\x06\x07") {
            return Err(err("MALFORMED_ARCHIVE", "Missing ZIP64 locator"));
        }
        let offset = u64::from_le_bytes(locator[8..16].try_into().unwrap());
        let z = data.read_at(offset, 56).map_err(ioerr)?;
        if z.len() != 56 || z.get(..4) != Some(b"PK\x06\x06") {
            return Err(err("MALFORMED_ARCHIVE", "Invalid ZIP64 header"));
        }
        total = u64::from_le_bytes(z[32..40].try_into().unwrap());
        metadata = u64::from_le_bytes(z[40..48].try_into().unwrap());
    }
    if total > ENTRY_LIMIT as u64 || metadata > METADATA_LIMIT {
        return Err(err("SAFETY_LIMIT", "Safety limit reached: ZIP directory"));
    }
    Ok(())
}
#[derive(Default)]
pub struct Archives {
    pub sessions: Mutex<HashMap<String, Arc<Session>>>,
    pub operations: Mutex<HashMap<String, Arc<extract::Operation>>>,
}
#[derive(Deserialize)]
pub struct Locator {
    pub path: Option<String>,
    pub session: Option<String>,
    pub entry: Option<usize>,
}
#[derive(Serialize)]
pub struct Opened {
    pub id: String,
    pub info: Info,
}
impl Archives {
    pub fn get(&self, id: &str) -> Result<Arc<Session>, FileError> {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| err("ENTRY_UNAVAILABLE", "Container session has closed"))
    }
    pub fn open(
        &self,
        access: &FileAccess,
        locator: Locator,
        name: String,
    ) -> Result<Opened, FileError> {
        static RECOVERY: std::sync::Once = std::sync::Once::new();
        RECOVERY.call_once(temp_store::recover);
        let (data, depth, chain_bytes) = if let Some(path) = locator.path {
            let path = access.authorized_path(Path::new(&path))?;
            let file = access.authorized_file(&path)?;
            let size = file.metadata().map_err(ioerr)?.len();
            (
                Arc::new(Data::Disk {
                    file,
                    size,
                    _owner: None,
                }),
                0,
                0,
            )
        } else {
            let parent = self.get(
                locator
                    .session
                    .as_deref()
                    .ok_or_else(|| err("ENTRY_UNAVAILABLE", "Missing source locator"))?,
            )?;
            let depth = parent.depth + 1;
            if depth > DEPTH_LIMIT {
                return Err(err("SAFETY_LIMIT", "Nested container depth limit reached"));
            }
            let entry = locator
                .entry
                .ok_or_else(|| err("ENTRY_UNAVAILABLE", "Missing entry identity"))?;
            let data = parent.prepare(entry, None)?;
            let chain = parent.chain_bytes + data.size();
            if chain > EXPANDED_BYTES {
                return Err(err("SAFETY_LIMIT", "Nested expanded-byte budget reached"));
            }
            (data, depth, chain)
        };
        if self.sessions.lock().unwrap().len() >= 64 {
            return Err(err("SAFETY_LIMIT", "Too many open container sessions"));
        }
        let info = Info {
            format: "Archive".into(),
            size: data.size(),
            encrypted: false,
            comment: None,
            diagnostics: vec![],
            complete: false,
            entries: 0,
            capabilities: Capabilities {
                list: true,
                read: true,
                extract: true,
                password: true,
                streaming: true,
            },
            error: None,
        };
        let id = uuid::Uuid::new_v4().to_string();
        let session = Arc::new(Session {
            id: id.clone(),
            depth,
            data: Mutex::new(data),
            entries: Mutex::new(vec![]),
            info: Mutex::new(info.clone()),
            cancelled: AtomicBool::new(false),
            cache: Mutex::new(HashMap::new()),
            zip_records: Mutex::new(None),
            pins: Mutex::new(HashMap::new()),
            chain_bytes,
        });
        self.sessions
            .lock()
            .unwrap()
            .insert(id.clone(), session.clone());
        std::thread::spawn(move || {
            let result = session.index(&name);
            let mut info = session.info.lock().unwrap();
            if let Err(error) = result {
                info.error = Some(error.message)
            }
            info.complete = true;
        });
        Ok(Opened { id, info })
    }
    pub fn close(&self, id: &str) {
        if let Some(s) = self.sessions.lock().unwrap().remove(id) {
            s.cancelled.store(true, Ordering::Relaxed)
        }
    }
}
