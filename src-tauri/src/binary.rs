//! Read-only binary sessions over already-authorized sources. No independent path grants.
use crate::{
    archive::{Archives, Locator},
    file_io::{FileAccess, FileError},
};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    fs::File,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::Manager;
pub const CHUNK: usize = 64 * 1024;
pub const MAX_READ: usize = 1024 * 1024;
pub const MAX_PATTERN: usize = 4096;
/// Reject oversize IPC arrays during deserialization, before an unbounded Vec allocation.
pub struct BoundedBytes<const LIMIT: usize>(Vec<u8>);
impl<'de, const LIMIT: usize> serde::Deserialize<'de> for BoundedBytes<LIMIT> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Visitor<const N: usize>;
        impl<'de, const N: usize> serde::de::Visitor<'de> for Visitor<N> {
            type Value = BoundedBytes<N>;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "at most {N} byte values")
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> Result<Self::Value, A::Error> {
                let mut bytes = Vec::with_capacity(seq.size_hint().unwrap_or(0).min(N));
                while let Some(byte) = seq.next_element::<u8>()? {
                    if bytes.len() == N {
                        return Err(serde::de::Error::custom("Binary IPC byte budget exceeded"));
                    }
                    bytes.push(byte);
                }
                Ok(BoundedBytes(bytes))
            }
        }
        deserializer.deserialize_seq(Visitor::<LIMIT>)
    }
}
fn error(code: &'static str, message: &str) -> FileError {
    FileError::new(code, message)
}
fn io(e: std::io::Error) -> FileError {
    error(
        match e.kind() {
            std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            std::io::ErrorKind::NotFound => "FILE_NOT_FOUND",
            _ => "READ_FAILED",
        },
        "Binary source I/O failed",
    )
}
pub fn decimal(value: &str) -> Result<u64, FileError> {
    if value.is_empty() || value.len() > 20 || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(error(
            "INVALID_OFFSET",
            "Use an unsigned decimal u64 offset",
        ));
    }
    value
        .parse()
        .map_err(|_| error("INVALID_OFFSET", "Offset exceeds u64"))
}
pub fn range(size: u64, offset: u64, length: usize) -> Result<usize, FileError> {
    if length > MAX_READ || offset.checked_add(length as u64).is_none() || offset > size {
        return Err(error(
            "INVALID_OFFSET",
            "Range is outside the source or request budget",
        ));
    }
    Ok(length.min((size - offset).min(MAX_READ as u64) as usize))
}
enum Source {
    Local {
        file: Mutex<File>,
        path: PathBuf,
        revision: String,
    },
    Archive {
        session: String,
        entry: usize,
    },
    Remote,
}
fn revision(file: &File) -> Result<String, FileError> {
    let m = file.metadata().map_err(io)?;
    Ok(format!("{}:{:?}", m.len(), m.modified().ok()))
}
fn read_at(file: &File, offset: u64, length: usize) -> Result<Vec<u8>, FileError> {
    let mut bytes = vec![0; length];
    let mut done = 0;
    while done < length {
        #[cfg(windows)]
        let n = {
            use std::os::windows::fs::FileExt;
            file.seek_read(&mut bytes[done..], offset + done as u64)
        };
        #[cfg(unix)]
        let n = {
            use std::os::unix::fs::FileExt;
            file.read_at(&mut bytes[done..], offset + done as u64)
        };
        #[cfg(not(any(windows, unix)))]
        let n = {
            use std::io::{Read, Seek, SeekFrom};
            let mut f = file.try_clone().map_err(io)?;
            f.seek(SeekFrom::Start(offset + done as u64)).map_err(io)?;
            f.read(&mut bytes[done..])
        };
        let n = n.map_err(io)?;
        if n == 0 {
            return Err(error("SOURCE_CHANGED", "File ended during the read"));
        }
        done += n;
    }
    Ok(bytes)
}
struct Cache {
    entries: HashMap<u64, Vec<u8>>,
    order: VecDeque<u64>,
    bytes: usize,
}
pub struct Session {
    source: Source,
    size: u64,
    closed: AtomicBool,
    cache: Mutex<Cache>,
    search: Mutex<Option<Arc<Search>>>,
}
impl Session {
    fn live(&self) -> Result<(), FileError> {
        if self.closed.load(Ordering::Acquire) {
            Err(error("SOURCE_CLOSED", "Binary source has closed"))
        } else {
            Ok(())
        }
    }
    pub fn read(
        &self,
        archives: &Archives,
        offset: u64,
        length: usize,
    ) -> Result<Vec<u8>, FileError> {
        self.live()?;
        let length = range(self.size, offset, length)?;
        // Revision and path existence must be checked even for a cached range.
        if let Source::Local {
            file,
            path,
            revision: expected,
        } = &self.source
        {
            let f = file
                .lock()
                .map_err(|_| error("READ_FAILED", "File lock unavailable"))?;
            if !path.try_exists().map_err(io)? {
                return Err(error("FILE_NOT_FOUND", "Binary source was deleted"));
            }
            let selected = same_file::Handle::from_file(f.try_clone().map_err(io)?).map_err(io)?;
            if selected != same_file::Handle::from_path(path).map_err(io)? {
                return Err(error(
                    "SOURCE_CHANGED",
                    "Source path was replaced; reopen the file",
                ));
            }
            if revision(&f)? != *expected {
                return Err(error("SOURCE_CHANGED", "Source changed; reopen the file"));
            }
        }
        if let Source::Archive { session, .. } = &self.source {
            archives.get(session)?;
        }
        {
            let cache = self.cache.lock().unwrap();
            if let Some(b) = cache.entries.get(&offset) {
                if b.len() == length {
                    return Ok(b.clone());
                }
            }
        }
        let bytes = match &self.source {
            Source::Local {
                file,
                revision: expected,
                ..
            } => {
                let f = file
                    .lock()
                    .map_err(|_| error("READ_FAILED", "File lock unavailable"))?;
                let bytes = read_at(&f, offset, length)?;
                if revision(&f)? != *expected {
                    return Err(error("SOURCE_CHANGED", "Source changed during the read"));
                }
                bytes
            }
            Source::Archive { session, entry } => {
                archives.get(session)?.read(*entry, offset, length)?
            }
            Source::Remote => {
                return Err(error(
                    "REMOTE_RANGE_REQUIRED",
                    "This source requires bounded frontend transport",
                ))
            }
        };
        self.live()?;
        if bytes.len() != length {
            return Err(error(
                "SOURCE_CHANGED",
                "Source ended before the requested range",
            ));
        }
        if length > 0 && length <= CHUNK {
            let mut cache = self.cache.lock().unwrap();
            self.live()?;
            if let Some(old) = cache.entries.remove(&offset) {
                cache.bytes -= old.len();
            }
            cache.order.retain(|n| *n != offset);
            while cache.bytes + length > CHUNK * 4 {
                if let Some(old) = cache.order.pop_front() {
                    if let Some(b) = cache.entries.remove(&old) {
                        cache.bytes -= b.len();
                    }
                } else {
                    break;
                }
            }
            cache.bytes += length;
            cache.order.push_back(offset);
            cache.entries.insert(offset, bytes.clone());
        }
        Ok(bytes)
    }
    fn close(&self) {
        self.closed.store(true, Ordering::Release);
        self.cancel();
        let mut cache = self.cache.lock().unwrap();
        cache.entries.clear();
        cache.order.clear();
        cache.bytes = 0;
    }
    fn cancel(&self) {
        if let Some(s) = self.search.lock().unwrap().take() {
            s.cancelled.store(true, Ordering::Release);
        }
    }
}
#[derive(Default)]
pub struct BinarySessions {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}
#[derive(Serialize)]
pub struct Opened {
    pub id: String,
    pub size: String,
    pub remote: bool,
}
impl BinarySessions {
    pub fn pause(&self, id: &str) { if let Ok(s)=self.get(id) { s.cancel();let mut cache=s.cache.lock().unwrap();cache.entries.clear();cache.order.clear();cache.bytes=0; } }

    pub fn close_all(&self) {
        let sources = std::mem::take(&mut *self.sessions.lock().unwrap());
        for s in sources.values() {
            s.close();
        }
    }
    pub fn pause_all(&self) {
        for s in self.sessions.lock().unwrap().values() {
            s.cancel();
            let mut cache = s.cache.lock().unwrap();
            cache.entries.clear();
            cache.order.clear();
            cache.bytes = 0;
        }
    }
    pub fn open(
        &self,
        access: &FileAccess,
        archives: &Archives,
        locator: Locator,
        remote_size: Option<String>,
    ) -> Result<Opened, FileError> {
        let (source, size) = match (locator.path, locator.session, locator.entry, remote_size) {
            (Some(path), None, None, None) => {
                let path = access.authorized_path(Path::new(&path))?;
                let file = access.authorized_file(&path)?;
                let size = file.metadata().map_err(io)?.len();
                let revision = revision(&file)?;
                (
                    Source::Local {
                        file: Mutex::new(file),
                        path,
                        revision,
                    },
                    size,
                )
            }
            (None, Some(session), Some(entry), None) => {
                let s = archives.get(&session)?;
                let e = s.entry(entry)?;
                if e.kind != "file" || e.unsafe_reason.is_some() {
                    return Err(error(
                        "PERMISSION_DENIED",
                        "Unsafe or non-file container entry",
                    ));
                }
                (Source::Archive { session, entry }, e.size)
            }
            (None, None, None, Some(size)) => (Source::Remote, decimal(&size)?),
            _ => {
                return Err(error(
                    "PERMISSION_DENIED",
                    "Use exactly one already-authorized source",
                ))
            }
        };
        let remote = matches!(source, Source::Remote);
        let id = uuid::Uuid::new_v4().to_string();
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.len() >= 32 {
            return Err(error("SAFETY_LIMIT", "At most 32 binary sessions"));
        }
        sessions.insert(
            id.clone(),
            Arc::new(Session {
                source,
                size,
                closed: AtomicBool::new(false),
                cache: Mutex::new(Cache {
                    entries: HashMap::new(),
                    order: VecDeque::new(),
                    bytes: 0,
                }),
                search: Mutex::new(None),
            }),
        );
        Ok(Opened {
            id,
            size: size.to_string(),
            remote,
        })
    }
    pub fn get(&self, id: &str) -> Result<Arc<Session>, FileError> {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| error("SOURCE_CLOSED", "Binary session is unavailable"))
    }
    pub fn close(&self, id: &str) {
        if let Some(s) = self.sessions.lock().unwrap().remove(id) {
            s.close();
        }
    }
    pub fn start(
        &self,
        id: &str,
        pattern: Vec<u8>,
        start: u64,
        previous: bool,
    ) -> Result<String, FileError> {
        let s = self.get(id)?;
        s.live()?;
        if pattern.is_empty() || pattern.len() > MAX_PATTERN || start > s.size {
            return Err(error(
                "INVALID_SEARCH",
                "Search needs 1–4096 bytes and a valid start",
            ));
        }
        s.cancel();
        let token = uuid::Uuid::new_v4().to_string();
        let prefix = prefix(&pattern);
        *s.search.lock().unwrap() = Some(Arc::new(Search {
            token: token.clone(),
            pattern,
            prefix,
            cursor: Mutex::new(start),
            previous,
            cancelled: AtomicBool::new(false),
        }));
        Ok(token)
    }
    pub fn step(
        &self,
        archives: &Archives,
        id: &str,
        token: &str,
        bytes: Option<Vec<u8>>,
    ) -> Result<SearchResult, FileError> {
        let s = self.get(id)?;
        s.live()?;
        let task = s
            .search
            .lock()
            .unwrap()
            .as_ref()
            .filter(|t| t.token == token)
            .cloned()
            .ok_or_else(|| error("ABORTED", "Search was cancelled or replaced"))?;
        let mut cursor = task
            .cursor
            .try_lock()
            .map_err(|_| error("SEARCH_BUSY", "One search step at a time"))?;
        if task.cancelled.load(Ordering::Acquire) {
            return Err(error("ABORTED", "Search cancelled"));
        }
        if (!task.previous && *cursor == s.size) || (task.previous && *cursor == 0) {
            return Ok(SearchResult::done(*cursor));
        }
        let at = if task.previous {
            cursor.saturating_sub(CHUNK as u64)
        } else {
            *cursor
        };
        let boundary = if task.previous {
            *cursor
        } else {
            at.saturating_add(CHUNK as u64).min(s.size)
        };
        let length = (boundary - at)
            .saturating_add((task.pattern.len() - 1) as u64)
            .min(s.size - at) as usize;
        let data = if matches!(s.source, Source::Remote) {
            match bytes {
                Some(b) if b.len() == length => b,
                Some(_) => return Err(error("INVALID_SEARCH", "Transport range length mismatch")),
                None => {
                    return Ok(SearchResult {
                        status: "need-range",
                        offset: None,
                        cursor: cursor.to_string(),
                        read_offset: Some(at.to_string()),
                        read_length: Some(length),
                    })
                }
            }
        } else {
            if bytes.is_some() {
                return Err(error(
                    "INVALID_SEARCH",
                    "Local search does not accept supplied bytes",
                ));
            }
            s.read(archives, at, length)?
        };
        let found = find(
            &data,
            &task.pattern,
            &task.prefix,
            &task.cancelled,
            task.previous,
            (boundary - at) as usize,
        )?;
        s.live()?;
        if task.cancelled.load(Ordering::Acquire) {
            return Err(error("ABORTED", "Search cancelled"));
        }
        *cursor = if task.previous { at } else { boundary };
        Ok(SearchResult {
            status: if found.is_some() {
                "found"
            } else if (!task.previous && *cursor == s.size) || (task.previous && *cursor == 0) {
                "done"
            } else {
                "scanning"
            },
            offset: found.map(|n| (at + n as u64).to_string()),
            cursor: cursor.to_string(),
            read_offset: None,
            read_length: None,
        })
    }
}
struct Search {
    token: String,
    pattern: Vec<u8>,
    prefix: Vec<usize>,
    cursor: Mutex<u64>,
    previous: bool,
    cancelled: AtomicBool,
}
#[derive(Serialize)]
pub struct SearchResult {
    pub status: &'static str,
    pub offset: Option<String>,
    pub cursor: String,
    #[serde(rename = "readOffset")]
    pub read_offset: Option<String>,
    #[serde(rename = "readLength")]
    pub read_length: Option<usize>,
}
impl SearchResult {
    fn done(cursor: u64) -> Self {
        Self {
            status: "done",
            offset: None,
            cursor: cursor.to_string(),
            read_offset: None,
            read_length: None,
        }
    }
}
fn prefix(pattern: &[u8]) -> Vec<usize> {
    let mut p = vec![0; pattern.len()];
    for i in 1..pattern.len() {
        let mut j = p[i - 1];
        while j > 0 && pattern[i] != pattern[j] {
            j = p[j - 1];
        }
        if pattern[i] == pattern[j] {
            j += 1;
        }
        p[i] = j;
    }
    p
}
fn find(
    data: &[u8],
    pattern: &[u8],
    p: &[usize],
    cancel: &AtomicBool,
    previous: bool,
    starts: usize,
) -> Result<Option<usize>, FileError> {
    let mut j = 0;
    let mut result = None;
    for (i, b) in data.iter().enumerate() {
        if i % 4096 == 0 && cancel.load(Ordering::Acquire) {
            return Err(error("ABORTED", "Search cancelled"));
        }
        while j > 0 && *b != pattern[j] {
            j = p[j - 1];
        }
        if *b == pattern[j] {
            j += 1;
        }
        if j == pattern.len() {
            let at = i + 1 - j;
            if at < starts {
                result = Some(at);
                if !previous {
                    return Ok(result);
                }
            }
            j = p[j - 1];
        }
    }
    Ok(result)
}
#[tauri::command]
pub async fn binary_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    locator: Locator,
    remote_size: Option<String>,
) -> Result<Opened, FileError> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let opened =
        app.state::<BinarySessions>().open(
            &app.state::<FileAccess>(),
            &app.state::<Archives>(),
            locator,
            remote_size,
        )?;
        crate::window_resources::register(&app,&owner,crate::window_resources::Kind::Binary,&opened.id)?;
        Ok(opened)
    })
    .await
    .map_err(|_| error("READ_FAILED", "Open task stopped"))?
}
#[tauri::command]
pub async fn binary_read(
    app: tauri::AppHandle,
    id: String,
    offset: String,
    length: usize,
) -> Result<tauri::ipc::Response, FileError> {
    let s = app.state::<BinarySessions>().get(&id)?;
    let at = decimal(&offset)?;
    tauri::async_runtime::spawn_blocking(move || {
        s.read(&app.state::<Archives>(), at, length)
            .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|_| error("READ_FAILED", "Read task stopped"))?
}
#[tauri::command]
pub fn binary_close(app: tauri::AppHandle, id: String) {
    app.state::<BinarySessions>().close(&id);
    app.state::<crate::window_resources::WindowResources>().forget(crate::window_resources::Kind::Binary,&id);
}
#[tauri::command]
pub fn binary_search_start(
    app: tauri::AppHandle,
    id: String,
    pattern: BoundedBytes<MAX_PATTERN>,
    start: String,
    previous: bool,
) -> Result<String, FileError> {
    app.state::<BinarySessions>()
        .start(&id, pattern.0, decimal(&start)?, previous)
}
#[tauri::command]
pub async fn binary_search_step(
    app: tauri::AppHandle,
    id: String,
    token: String,
    bytes: Option<BoundedBytes<{ CHUNK + MAX_PATTERN - 1 }>>,
) -> Result<SearchResult, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<BinarySessions>().step(
            &app.state::<Archives>(),
            &id,
            &token,
            bytes.map(|b| b.0),
        )
    })
    .await
    .map_err(|_| error("READ_FAILED", "Search task stopped"))?
}
#[derive(Serialize)]
pub struct Stats {
    sessions: usize,
    handles: usize,
    cache_bytes: usize,
    searches: usize,
}
#[tauri::command]
pub fn binary_stats(app: tauri::AppHandle) -> Stats {
    let all = app.state::<BinarySessions>();
    let sessions = all.sessions.lock().unwrap();
    Stats {
        sessions: sessions.len(),
        handles: sessions
            .values()
            .filter(|s| matches!(s.source, Source::Local { .. }))
            .count(),
        cache_bytes: sessions
            .values()
            .map(|s| s.cache.lock().unwrap().bytes)
            .sum(),
        searches: sessions
            .values()
            .filter(|s| s.search.lock().unwrap().is_some())
            .count(),
    }
}
#[tauri::command]
pub fn binary_search_cancel(app: tauri::AppHandle, id: String, token: Option<String>) {
    if let Ok(s) = app.state::<BinarySessions>().get(&id) {
        let mut search = s.search.lock().unwrap();
        if search
            .as_ref()
            .is_some_and(|t| token.as_ref().is_none_or(|n| *n == t.token))
        {
            if let Some(t) = search.take() {
                t.cancelled.store(true, Ordering::Release);
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn setup(
        bytes: &[u8],
    ) -> (
        tempfile::TempDir,
        FileAccess,
        Archives,
        BinarySessions,
        Opened,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data.bin");
        std::fs::write(&path, bytes).unwrap();
        let access = FileAccess::default();
        access.grant(&path).unwrap();
        let archives = Archives::default();
        let sessions = BinarySessions::default();
        let opened = sessions
            .open(
                &access,
                &archives,
                Locator {
                    path: Some(path.to_string_lossy().into()),
                    session: None,
                    entry: None,
                },
                None,
            )
            .unwrap();
        (dir, access, archives, sessions, opened)
    }
    #[test]
    fn offsets() {
        for bad in ["", "-1", "1.5", "1e3", " 1", "18446744073709551616"] {
            assert!(decimal(bad).is_err());
        }
        assert_eq!(decimal("9007199254740993").unwrap(), 9007199254740993);
        assert!(range(u64::MAX, u64::MAX, 1).is_err());
        assert!(range(1, 2, 0).is_err());
        assert!(range(10, 0, MAX_READ + 1).is_err());
        assert_eq!(range(0, 0, 16).unwrap(), 0);
    }
    #[test]
    fn exact_and_close() {
        let (_dir, _access, a, s, o) = setup(&[0, 1, 255]);
        let source = s.get(&o.id).unwrap();
        assert_eq!(source.read(&a, 1, 20).unwrap(), [1, 255]);
        s.close(&o.id);
        assert!(source.read(&a, 0, 1).is_err());
        assert!(s.sessions.lock().unwrap().is_empty());
        assert_eq!(source.cache.lock().unwrap().bytes, 0);
    }
    #[test]
    fn search_boundary_and_previous() {
        let mut b = vec![0; CHUNK * 2 + 4];
        b[CHUNK - 1..CHUNK + 3].copy_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
        b[CHUNK * 2..].copy_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
        let (_dir, _access, a, s, o) = setup(&b);
        let token = s
            .start(&o.id, vec![0xde, 0xad, 0xbe, 0xef], 0, false)
            .unwrap();
        assert_eq!(
            s.step(&a, &o.id, &token, None).unwrap().offset,
            Some((CHUNK - 1).to_string())
        );
        let token = s
            .start(&o.id, vec![0xde, 0xad, 0xbe, 0xef], b.len() as u64, true)
            .unwrap();
        assert_eq!(
            s.step(&a, &o.id, &token, None).unwrap().offset,
            Some((CHUNK * 2).to_string())
        );
    }
    #[test]
    fn single_none_empty_cancel() {
        let (_dir, _access, a, s, o) = setup(&[7, 8, 7]);
        assert!(s.start(&o.id, vec![], 0, false).is_err());
        assert!(s.start(&o.id, vec![0; MAX_PATTERN + 1], 0, false).is_err());
        let t = s.start(&o.id, vec![7], 1, false).unwrap();
        assert_eq!(
            s.step(&a, &o.id, &t, None).unwrap().offset,
            Some("2".into())
        );
        let t = s.start(&o.id, vec![99], 0, false).unwrap();
        assert_eq!(s.step(&a, &o.id, &t, None).unwrap().status, "done");
        s.get(&o.id).unwrap().cancel();
        assert!(s.step(&a, &o.id, &t, None).is_err());
    }
    #[test]
    fn mutation_and_deleted() {
        let (d, _, a, s, o) = setup(&[1]);
        std::fs::write(d.path().join("data.bin"), [1, 2]).unwrap();
        assert_eq!(
            s.get(&o.id).unwrap().read(&a, 0, 1).unwrap_err().code,
            "SOURCE_CHANGED"
        );
        std::fs::remove_file(d.path().join("data.bin")).unwrap();
        assert_eq!(
            s.get(&o.id).unwrap().read(&a, 0, 1).unwrap_err().code,
            "FILE_NOT_FOUND"
        );
    }
    #[test]
    fn permission_and_remote() {
        let sessions = BinarySessions::default();
        let access = FileAccess::default();
        let archives = Archives::default();
        assert!(sessions
            .open(
                &access,
                &archives,
                Locator {
                    path: Some("C:/not-granted.bin".into()),
                    session: None,
                    entry: None
                },
                None
            )
            .is_err());
        let o = sessions
            .open(
                &access,
                &archives,
                Locator {
                    path: None,
                    session: None,
                    entry: None,
                },
                Some("9007199254740994".into()),
            )
            .unwrap();
        let t = sessions
            .start(&o.id, vec![65], 9007199254740993, false)
            .unwrap();
        let need = sessions.step(&archives, &o.id, &t, None).unwrap();
        assert_eq!(need.read_offset, Some("9007199254740993".into()));
        assert_eq!(
            sessions
                .step(&archives, &o.id, &t, Some(vec![65]))
                .unwrap()
                .offset,
            Some("9007199254740993".into())
        );
    }
    #[test]
    fn bounded_cache() {
        let (_dir, _access, a, s, o) = setup(&vec![1; CHUNK * 10]);
        let source = s.get(&o.id).unwrap();
        for n in 0..10 {
            source.read(&a, n * CHUNK as u64, CHUNK).unwrap();
        }
        assert!(source.cache.lock().unwrap().bytes <= CHUNK * 4);
    }
    #[test]
    fn cancellation_in_algorithm() {
        let cancel = AtomicBool::new(true);
        assert!(find(&[0; 100], &[1], &[0], &cancel, false, 100).is_err());
    }
    #[test]
    fn ipc_input_budget() {
        assert!(serde_json::from_str::<BoundedBytes<2>>("[0,1,2]").is_err());
        assert!(serde_json::from_str::<BoundedBytes<2>>("[256]").is_err());
        assert_eq!(
            serde_json::from_str::<BoundedBytes<2>>("[0,255]")
                .unwrap()
                .0,
            [0, 255]
        );
    }
    #[test]
    fn minimize_and_reload_cleanup() {
        let (_dir, _access, a, s, o) = setup(&[1, 2, 3]);
        let source = s.get(&o.id).unwrap();
        source.read(&a, 0, 3).unwrap();
        s.start(&o.id, vec![9], 0, false).unwrap();
        s.pause_all();
        assert_eq!(source.cache.lock().unwrap().bytes, 0);
        assert!(source.search.lock().unwrap().is_none());
        assert!(!source.closed.load(Ordering::Acquire));
        s.close_all();
        assert!(source.closed.load(Ordering::Acquire));
        assert!(s.sessions.lock().unwrap().is_empty());
    }
    #[test]
    fn isolated_positional_handles() {
        let (_dir, _access, a, s, o) =
            setup(&(0..=255).cycle().take(CHUNK * 2).collect::<Vec<u8>>());
        let source = s.get(&o.id).unwrap();
        std::thread::scope(|scope| {
            for i in 0..8 {
                let source = &source;
                let a = &a;
                scope.spawn(move || {
                    for n in 0..30 {
                        let offset = (i * 251 + n * 109) as u64;
                        let b = source.read(a, offset, 32).unwrap();
                        assert_eq!(b[0], (offset % 256) as u8);
                        assert_eq!(b[31], ((offset + 31) % 256) as u8);
                    }
                });
            }
        });
    }
    #[test]
    fn sparse_files_and_resource_release() {
        use std::io::{Seek, SeekFrom, Write};
        let dir = tempfile::tempdir().unwrap();
        let mut records = Vec::new();
        for size in [
            100 * 1024 * 1024u64,
            1024 * 1024 * 1024,
            5 * 1024 * 1024 * 1024,
        ] {
            let path = dir.path().join(format!("{size}.bin"));
            let mut file = File::create(&path).unwrap();
            #[cfg(windows)]
            {
                assert!(std::process::Command::new("fsutil.exe")
                    .args(["sparse", "setflag"])
                    .arg(&path)
                    .stdout(std::process::Stdio::null())
                    .status()
                    .unwrap()
                    .success());
            }
            file.set_len(size).unwrap();
            file.seek(SeekFrom::Start(size - 4)).unwrap();
            file.write_all(&[0xde, 0xad, 0xbe, 0xef]).unwrap();
            drop(file);
            let access = FileAccess::default();
            access.grant(&path).unwrap();
            let archives = Archives::default();
            let sessions = BinarySessions::default();
            let opened = sessions
                .open(
                    &access,
                    &archives,
                    Locator {
                        path: Some(path.to_string_lossy().into()),
                        session: None,
                        entry: None,
                    },
                    None,
                )
                .unwrap();
            let source = sessions.get(&opened.id).unwrap();
            let start = std::time::Instant::now();
            assert_eq!(
                source.read(&archives, size - 4, 4).unwrap(),
                [0xde, 0xad, 0xbe, 0xef]
            );
            let token = sessions
                .start(&opened.id, vec![0xde, 0xad, 0xbe, 0xef], size, true)
                .unwrap();
            assert_eq!(
                sessions
                    .step(&archives, &opened.id, &token, None)
                    .unwrap()
                    .offset,
                Some((size - 4).to_string())
            );
            for n in 0..100 {
                source.read(&archives, (n * CHUNK) as u64, 16).unwrap();
                assert!(source.cache.lock().unwrap().bytes <= CHUNK * 4);
            }
            records.push(serde_json::json!({"size":size,"ranges":101,"elapsedMs":start.elapsed().as_secs_f64()*1000.0,"peakCacheLimit":CHUNK*4}));
            sessions.close(&opened.id);
            assert!(source.search.lock().unwrap().is_none());
            assert_eq!(source.cache.lock().unwrap().bytes, 0);
            assert!(sessions.sessions.lock().unwrap().is_empty());
        }
        let output = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../docs/qa/module-18-rust-performance.json");
        std::fs::write(output,serde_json::to_vec_pretty(&serde_json::json!({"environment":"Current Windows/host Rust test; actual sparse files, not old i5 validation","records":records})).unwrap()).unwrap();
    }
}
