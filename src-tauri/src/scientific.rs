//! Scientific allocation/session boundary. Parsers cannot grant paths or load plugins.
use crate::{
    archive::{Archives, Locator},
    binary::{self, BinarySessions},
    file_io::{FileAccess, FileError},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    http::{Request, Response},
    Manager,
};
pub const PAGE_BYTES: u64 = 1024 * 1024;
pub const DECODE_BYTES: u64 = 32 * 1024 * 1024;
pub const GLOBAL_DECODE_BYTES: u64 = 64 * 1024 * 1024;
fn err(code: &'static str, message: &str) -> FileError {
    FileError::new(code, message)
}
#[derive(Serialize)]
pub struct Axes(Vec<String>);
impl<'de> Deserialize<'de> for Axes {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Visitor;
        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = Axes;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("at most 32 unsigned decimal axes")
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut seq: A) -> Result<Axes, A::Error> {
                let mut axes = Vec::with_capacity(seq.size_hint().unwrap_or(0).min(32));
                while let Some(value) = seq.next_element::<String>()? {
                    if axes.len() == 32 || value.len() > 20 {
                        return Err(serde::de::Error::custom(
                            "Scientific axis IPC budget exceeded",
                        ));
                    }
                    axes.push(value);
                }
                Ok(Axes(axes))
            }
        }
        d.deserialize_seq(Visitor)
    }
}
fn axes<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    Axes::deserialize(d).map(|v| v.0)
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SliceRequest {
    pub dataset_id: String,
    #[serde(deserialize_with = "axes")]
    pub dimension_selection: Vec<String>,
    #[serde(deserialize_with = "axes")]
    pub start: Vec<String>,
    #[serde(deserialize_with = "axes")]
    pub count: Vec<String>,
    #[serde(deserialize_with = "axes")]
    pub stride: Vec<String>,
    pub request_id: String,
    pub element_bytes: u64,
}
/// Validate each axis and every intermediate product before a decoder allocates output.
pub fn validate_slice(shape: &[String], r: &SliceRequest) -> Result<u64, FileError> {
    if shape.len() > 32
        || r.dataset_id.len() > 4096
        || r.request_id.is_empty()
        || r.request_id.len() > 128
        || r.element_bytes == 0
        || r.element_bytes > 65536
        || r.start.len() != shape.len()
        || r.count.len() != shape.len()
        || r.stride.len() != shape.len()
        || r.dimension_selection.len() > shape.len()
    {
        return Err(err(
            "INVALID_SLICE",
            "Invalid rank, identity, or datatype width",
        ));
    }
    let mut output = 1u64;
    let mut total = 1u64;
    for i in 0..shape.len() {
        let size = binary::decimal(&shape[i])?;
        let start = binary::decimal(&r.start[i])?;
        let count = binary::decimal(&r.count[i])?;
        let stride = binary::decimal(&r.stride[i])?;
        total = total
            .checked_mul(size)
            .ok_or_else(|| err("RESOURCE_LIMIT_EXCEEDED", "Shape product exceeds u64"))?;
        if stride == 0
            || start > size
            || (count > 0
                && (start >= size
                    || (count - 1)
                        .checked_mul(stride)
                        .and_then(|n| start.checked_add(n))
                        .filter(|&end| end < size)
                        .is_none()))
        {
            return Err(err("INVALID_SLICE", "Slice is outside the dataset"));
        }
        if let Some(fixed) = r.dimension_selection.get(i) {
            if binary::decimal(fixed)? >= size || count != 1 || start != binary::decimal(fixed)? {
                return Err(err(
                    "INVALID_SLICE",
                    "Fixed dimension disagrees with the selected slice",
                ));
            }
        }
        output = output
            .checked_mul(count)
            .ok_or_else(|| err("RESOURCE_LIMIT_EXCEEDED", "Slice product overflow"))?;
    }
    let bytes = output
        .checked_mul(r.element_bytes)
        .ok_or_else(|| err("RESOURCE_LIMIT_EXCEEDED", "Slice byte size overflow"))?;
    if bytes > PAGE_BYTES {
        return Err(err(
            "RESOURCE_LIMIT_EXCEEDED",
            "Decoded slice exceeds 1 MiB",
        ));
    }
    Ok(bytes)
}
struct Task {
    bytes: u64,
    cancelled: Arc<AtomicBool>,
}
pub struct Session {
    pub binary_id: String,
    pub size: u64,
    pub remote: bool,
    paused: AtomicBool,
    closed: AtomicBool,
    tasks: Mutex<HashMap<String, Task>>,
}
#[derive(Default)]
pub struct ScientificSessions {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}
#[derive(Serialize)]
pub struct Opened {
    pub id: String,
    pub size: String,
    pub remote: bool,
}
impl ScientificSessions {
    pub fn open(
        &self,
        binaries: &BinarySessions,
        access: &FileAccess,
        archives: &Archives,
        locator: Locator,
        remote_size: Option<String>,
    ) -> Result<Opened, FileError> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.len() >= 8 {
            return Err(err(
                "RESOURCE_LIMIT_EXCEEDED",
                "At most eight scientific sessions",
            ));
        }
        let opened = binaries.open(access, archives, locator, remote_size)?;
        let id = uuid::Uuid::new_v4().to_string();
        let size = binary::decimal(&opened.size)?;
        sessions.insert(
            id.clone(),
            Arc::new(Session {
                binary_id: opened.id,
                size,
                remote: opened.remote,
                paused: AtomicBool::new(false),
                closed: AtomicBool::new(false),
                tasks: Mutex::new(HashMap::new()),
            }),
        );
        Ok(Opened {
            id,
            size: size.to_string(),
            remote: opened.remote,
        })
    }
    pub fn get(&self, id: &str) -> Result<Arc<Session>, FileError> {
        let s = self
            .sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| err("SOURCE_CLOSED", "Scientific session has closed"))?;
        if s.closed.load(Ordering::Acquire) {
            return Err(err("SOURCE_CLOSED", "Scientific session has closed"));
        }
        Ok(s)
    }
    pub fn begin(&self, id: &str, request: &str, bytes: u64) -> Result<Arc<AtomicBool>, FileError> {
        if request.is_empty() || request.len() > 128 || bytes > DECODE_BYTES {
            return Err(err(
                "RESOURCE_LIMIT_EXCEEDED",
                "Invalid task or decoded block budget",
            ));
        }
        // Single lock order: registry → task map. Reservation is atomic across all documents.
        let sessions = self.sessions.lock().unwrap();
        let s = sessions
            .get(id)
            .ok_or_else(|| err("SOURCE_CLOSED", "Scientific session has closed"))?;
        if s.paused.load(Ordering::Acquire) || s.closed.load(Ordering::Acquire) {
            return Err(err("CANCELLED", "Scientific work is paused"));
        }
        let used: u64 = sessions
            .values()
            .map(|s| {
                s.tasks
                    .lock()
                    .unwrap()
                    .values()
                    .map(|t| t.bytes)
                    .sum::<u64>()
            })
            .sum();
        if used
            .checked_add(bytes)
            .filter(|&n| n <= GLOBAL_DECODE_BYTES)
            .is_none()
        {
            return Err(err(
                "RESOURCE_LIMIT_EXCEEDED",
                "Global decoded reservation exceeds 64 MiB",
            ));
        }
        let mut tasks = s.tasks.lock().unwrap();
        if tasks.len() >= 2 || tasks.contains_key(request) {
            return Err(err("RESOURCE_LIMIT_EXCEEDED","At most two tasks per scientific session; request identities cannot be reused while active"));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        tasks.insert(
            request.into(),
            Task {
                bytes,
                cancelled: cancelled.clone(),
            },
        );
        Ok(cancelled)
    }
    pub fn finish(&self, id: &str, request: &str) {
        if let Ok(s) = self.get(id) {
            if let Some(t) = s.tasks.lock().unwrap().remove(request) {
                t.cancelled.store(true, Ordering::Release);
            }
        }
    }
    pub fn pause(&self, id: &str, paused: bool) {
        if let Ok(s) = self.get(id) {
            s.paused.store(paused, Ordering::Release);
            if paused {
                for (_, t) in s.tasks.lock().unwrap().drain() {
                    t.cancelled.store(true, Ordering::Release);
                }
            }
        }
    }
    pub fn pause_all(&self) {
        let ids: Vec<_> = self.sessions.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.pause(&id, true);
        }
    }
    pub fn close(&self, id: &str, binaries: &BinarySessions) {
        if let Some(s) = self.sessions.lock().unwrap().remove(id) {
            s.closed.store(true, Ordering::Release);
            for (_, t) in s.tasks.lock().unwrap().drain() {
                t.cancelled.store(true, Ordering::Release);
            }
            binaries.close(&s.binary_id);
        }
    }
    pub fn close_all(&self, binaries: &BinarySessions) {
        let ids: Vec<_> = self.sessions.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.close(&id, binaries);
        }
    }
    pub fn read(
        &self,
        id: &str,
        binaries: &BinarySessions,
        archives: &Archives,
        offset: u64,
        length: usize,
    ) -> Result<Vec<u8>, FileError> {
        let s = self.get(id)?;
        if s.paused.load(Ordering::Acquire) {
            return Err(err("CANCELLED", "Scientific reads are paused"));
        }
        if offset
            .checked_add(length as u64)
            .filter(|&n| n <= s.size)
            .is_none()
            || length > binary::MAX_READ
        {
            return Err(err(
                "INVALID_OFFSET",
                "Scientific range exceeds file or 1 MiB",
            ));
        }
        let bytes = binaries.get(&s.binary_id)?.read(archives, offset, length)?;
        if s.closed.load(Ordering::Acquire) || s.paused.load(Ordering::Acquire) {
            return Err(err("CANCELLED", "Scientific range was cancelled"));
        }
        Ok(bytes)
    }
    pub fn respond(
        &self,
        binaries: &BinarySessions,
        archives: &Archives,
        r: Request<Vec<u8>>,
    ) -> Response<Vec<u8>> {
        let origin = r
            .headers()
            .get("origin")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let allowed = matches!(
            origin,
            "" | "tauri://localhost"
                | "http://tauri.localhost"
                | "https://tauri.localhost"
                | "http://127.0.0.1:1420"
                | "http://localhost:1420"
                | "http://127.0.0.1:1421"
        );
        let cors = if origin.is_empty() {
            "http://tauri.localhost"
        } else {
            origin
        };
        let response = |status, body: Vec<u8>, range: Option<String>| {
            let mut b = Response::builder()
                .status(status)
                .header(
                    "Access-Control-Allow-Origin",
                    if allowed { cors } else { "null" },
                )
                .header("Access-Control-Allow-Headers", "Range")
                .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                .header(
                    "Access-Control-Expose-Headers",
                    "Content-Range, X-Elorin-Error",
                )
                .header("Cache-Control", "no-store")
                .header("Content-Type", "application/octet-stream");
            if let Some(range) = range {
                b = b.header("Content-Range", range);
            }
            b.body(body).unwrap()
        };
        if !allowed {
            return response(403, vec![], None);
        }
        if r.method() == "OPTIONS" {
            return response(204, vec![], None);
        }
        if r.method() != "GET" {
            return response(405, vec![], None);
        }
        let id = r.uri().path().trim_start_matches('/');
        let s = match self.get(id) {
            Ok(s) => s,
            Err(_) => return response(404, vec![], None),
        };
        let Some((at, end)) = crate::media::parse_range(
            r.headers().get("range").and_then(|h| h.to_str().ok()),
            s.size,
        ) else {
            return response(416, vec![], None);
        };
        if end - at + 1 > binary::MAX_READ as u64 {
            return response(413, vec![], None);
        }
        match self.read(id, binaries, archives, at, (end - at + 1) as usize) {
            Ok(b) => response(206, b, Some(format!("bytes {at}-{end}/{}", s.size))),
            Err(e) => {
                let mut r = response(409, vec![], None);
                r.headers_mut()
                    .insert("X-Elorin-Error", e.code.parse().unwrap());
                r
            }
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub sessions: usize,
    pub tasks: usize,
    pub reserved_bytes: u64,
}
#[tauri::command]
pub fn scientific_stats(app: tauri::AppHandle) -> Stats {
    let state = app.state::<ScientificSessions>();
    let sessions = state.sessions.lock().unwrap();
    Stats {
        sessions: sessions.len(),
        tasks: sessions
            .values()
            .map(|s| s.tasks.lock().unwrap().len())
            .sum(),
        reserved_bytes: sessions
            .values()
            .map(|s| {
                s.tasks
                    .lock()
                    .unwrap()
                    .values()
                    .map(|t| t.bytes)
                    .sum::<u64>()
            })
            .sum(),
    }
}
#[tauri::command]
pub async fn scientific_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    locator: Locator,
    remote_size: Option<String>,
) -> Result<Opened, FileError> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let opened =
        app.state::<ScientificSessions>().open(
            &app.state::<BinarySessions>(),
            &app.state::<FileAccess>(),
            &app.state::<Archives>(),
            locator,
            remote_size,
        )?;
        crate::window_resources::register(&app,&owner,crate::window_resources::Kind::Scientific,&opened.id)?;
        Ok(opened)
    })
    .await
    .map_err(|_| err("READ_FAILED", "Scientific open task failed"))?
}
#[tauri::command]
pub async fn scientific_read(
    app: tauri::AppHandle,
    id: String,
    offset: String,
    length: usize,
) -> Result<tauri::ipc::Response, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let n = binary::decimal(&offset)?;
        app.state::<ScientificSessions>()
            .read(
                &id,
                &app.state::<BinarySessions>(),
                &app.state::<Archives>(),
                n,
                length,
            )
            .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|_| err("READ_FAILED", "Scientific read task failed"))?
}
#[tauri::command]
pub fn scientific_close(app: tauri::AppHandle, id: String) {
    app.state::<ScientificSessions>()
        .close(&id, &app.state::<BinarySessions>());
    app.state::<crate::window_resources::WindowResources>().forget(crate::window_resources::Kind::Scientific,&id);
}
#[tauri::command]
pub fn scientific_pause(app: tauri::AppHandle, id: String, paused: bool) {
    app.state::<ScientificSessions>().pause(&id, paused);
}
#[tauri::command]
pub fn scientific_begin(
    app: tauri::AppHandle,
    id: String,
    request_id: String,
    decoded_bytes: String,
) -> Result<(), FileError> {
    app.state::<ScientificSessions>()
        .begin(&id, &request_id, binary::decimal(&decoded_bytes)?)?;
    Ok(())
}
#[tauri::command]
pub fn scientific_finish(app: tauri::AppHandle, id: String, request_id: String) {
    app.state::<ScientificSessions>().finish(&id, &request_id);
}
#[tauri::command]
pub fn scientific_validate_slice(
    app: tauri::AppHandle,
    id: String,
    shape: Axes,
    request: SliceRequest,
) -> Result<String, FileError> {
    app.state::<ScientificSessions>().get(&id)?;
    validate_slice(&shape.0, &request).map(|n| n.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn req() -> SliceRequest {
        SliceRequest {
            dataset_id: "x".into(),
            dimension_selection: vec![],
            start: vec!["0".into()],
            count: vec!["1".into()],
            stride: vec!["1".into()],
            request_id: "r".into(),
            element_bytes: 8,
        }
    }
    #[test]
    fn exact_axis_validation() {
        let mut r = req();
        r.start[0] = "9007199254740993".into();
        assert_eq!(validate_slice(&["9007199254740994".into()], &r).unwrap(), 8);
        for bad in ["-1", "1e3", "18446744073709551616"] {
            r.start[0] = bad.into();
            assert!(validate_slice(&["10".into()], &r).is_err());
        }
        r = req();
        r.stride[0] = "0".into();
        assert!(validate_slice(&["10".into()], &r).is_err());
        r = req();
        r.count[0] = "2".into();
        r.start[0] = u64::MAX.to_string();
        assert!(validate_slice(&[u64::MAX.to_string()], &r).is_err());
        r = req();
        r.count[0] = "200000".into();
        assert!(validate_slice(&["200000".into()], &r).is_err());
    }
    #[test]
    fn ipc_axes_are_bounded() {
        assert!(serde_json::from_value::<Axes>(serde_json::json!(vec!["0"; 33])).is_err());
        assert!(serde_json::from_value::<Axes>(serde_json::json!(["0".repeat(21)])).is_err());
        assert!(serde_json::from_value::<Axes>(serde_json::json!(vec!["0"; 32])).is_ok());
    }
    #[test]
    fn scalar_empty_and_shape_overflow() {
        let mut r = req();
        r.start.clear();
        r.count.clear();
        r.stride.clear();
        assert_eq!(validate_slice(&[], &r).unwrap(), 8);
        r = req();
        r.count[0] = "0".into();
        assert_eq!(validate_slice(&["0".into()], &r).unwrap(), 0);
        r = req();
        r.start.push("0".into());
        r.count.push("1".into());
        r.stride.push("1".into());
        assert!(validate_slice(&[u64::MAX.to_string(), "2".into()], &r).is_err());
    }
    #[test]
    fn reservations_pause_close_and_isolation() {
        let s = ScientificSessions::default();
        let b = BinarySessions::default();
        let a = FileAccess::default();
        let v = Archives::default();
        let open = || {
            s.open(
                &b,
                &a,
                &v,
                Locator {
                    path: None,
                    session: None,
                    entry: None,
                },
                Some("10000000000".into()),
            )
            .unwrap()
        };
        let x = open();
        let y = open();
        assert_ne!(x.id, y.id);
        let t = s.begin(&x.id, "a", DECODE_BYTES).unwrap();
        s.begin(&y.id, "b", DECODE_BYTES).unwrap();
        assert!(s.begin(&x.id, "c", 1).is_err());
        s.pause(&x.id, true);
        assert!(t.load(Ordering::Acquire));
        assert!(s.begin(&x.id, "c", 1).is_err());
        s.pause(&x.id, false);
        s.begin(&x.id, "c", 1).unwrap();
        s.finish(&x.id, "c");
        s.close_all(&b);
        assert!(s.get(&x.id).is_err());
        assert!(s.sessions.lock().unwrap().is_empty());
    }
    #[test]
    fn native_reads_authorization_and_protocol() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.dat");
        std::fs::write(&path, [1, 2, 3, 4]).unwrap();
        let a = FileAccess::default();
        let v = Archives::default();
        let b = BinarySessions::default();
        let s = ScientificSessions::default();
        let locator = || Locator {
            path: Some(path.to_string_lossy().into()),
            session: None,
            entry: None,
        };
        assert!(s.open(&b, &a, &v, locator(), None).is_err());
        a.grant(&path).unwrap();
        let o = s.open(&b, &a, &v, locator(), None).unwrap();
        assert_eq!(s.read(&o.id, &b, &v, 1, 2).unwrap(), [2, 3]);
        assert!(s.read(&o.id, &b, &v, u64::MAX, 2).is_err());
        assert!(s.read(&o.id, &b, &v, 3, 2).is_err());
        let r = Request::builder()
            .uri(format!("http://prism-science.localhost/{}", o.id))
            .header("origin", "https://evil.invalid")
            .header("range", "bytes=0-1")
            .body(vec![])
            .unwrap();
        assert_eq!(s.respond(&b, &v, r).status(), 403);
        let r = Request::builder()
            .uri(format!("http://prism-science.localhost/{}", o.id))
            .header("range", "bytes=1-2")
            .body(vec![])
            .unwrap();
        let response = s.respond(&b, &v, r);
        assert_eq!(response.status(), 206);
        assert_eq!(response.body(), &[2, 3]);
        s.close(&o.id, &b);
        assert!(s.read(&o.id, &b, &v, 0, 1).is_err());
    }
}
