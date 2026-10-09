use super::*;
use tauri::{
    http::{Request, Response},
    Manager,
};
#[tauri::command]
pub async fn archive_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    locator: Locator,
    name: String,
) -> Result<Opened, FileError> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let opened=app.state::<Archives>()
            .open(&app.state::<FileAccess>(), locator, name)?;
        crate::window_resources::register(&app,&owner,crate::window_resources::Kind::Archive,&opened.id)?;
        Ok(opened)
    })
    .await
    .map_err(|_| err("ARCHIVE_IO", "Archive worker stopped"))?
}
#[derive(Serialize)]
pub struct Page {
    pub info: Info,
    pub entries: Vec<Entry>,
}
#[tauri::command]
pub fn archive_list(
    app: tauri::AppHandle,
    session: String,
    offset: usize,
) -> Result<Page, FileError> {
    let session = app.state::<Archives>().get(&session)?;
    let entries = session
        .entries
        .lock()
        .unwrap()
        .iter()
        .skip(offset)
        .take(2000)
        .cloned()
        .collect();
    let info = session.info.lock().unwrap().clone();
    Ok(Page { info, entries })
}
#[tauri::command]
pub async fn archive_prepare_entry(
    app: tauri::AppHandle,
    session: String,
    entry: usize,
    password: Option<String>,
) -> Result<(), FileError> {
    let s = app.state::<Archives>().get(&session)?;
    tauri::async_runtime::spawn_blocking(move || {
        s.prepare(entry, password.as_deref()).map(|_| {
            *s.pins.lock().unwrap().entry(entry).or_default() += 1;
        })
    })
    .await
    .map_err(|_| err("ARCHIVE_IO", "Entry worker stopped"))?
}
#[tauri::command]
pub async fn archive_read_entry(
    app: tauri::AppHandle,
    session: String,
    entry: usize,
    offset: u64,
    length: usize,
) -> Result<tauri::ipc::Response, FileError> {
    let s = app.state::<Archives>().get(&session)?;
    tauri::async_runtime::spawn_blocking(move || {
        s.read(entry, offset, length).map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|_| err("ARCHIVE_IO", "Entry worker stopped"))?
}
#[tauri::command]
pub fn archive_close(app: tauri::AppHandle, session: String) {
    app.state::<Archives>().close(&session)
}
#[tauri::command]
pub async fn archive_extract(
    app: tauri::AppHandle,
    session: String,
    ids: Option<Vec<usize>>,
    policy: String,
    title: Option<String>,
    password: Option<String>,
) -> Result<Option<String>, FileError> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_title(title.filter(|value| value.len() <= 256).unwrap_or_else(|| "Extract archive to folder".into()))
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let path = path
            .into_path()
            .map_err(|_| err("UNSAFE_PATH", "Choose a local directory"))?;
        let canonical = path.canonicalize().map_err(ioerr)?;
        let root = cap_std::fs::Dir::open_ambient_dir(canonical, cap_std::ambient_authority())
            .map_err(ioerr)?;
        app.state::<Archives>()
            .extract_to(&session, root, ids, policy, password)
            .map(Some)
    })
    .await
    .map_err(|_| err("ARCHIVE_IO", "Extraction worker stopped"))?
}
#[tauri::command]
pub fn archive_extraction_status(
    app: tauri::AppHandle,
    operation: String,
) -> Result<extract::Status, FileError> {
    let op = app.state::<Archives>().operation(&operation)?;
    let status = op.status.lock().unwrap().clone();
    Ok(status)
}
#[tauri::command]
pub fn archive_cancel_extraction(
    app: tauri::AppHandle,
    operation: String,
) -> Result<(), FileError> {
    app.state::<Archives>().operation(&operation)?.cancel();
    Ok(())
}
#[tauri::command]
pub fn archive_resolve_conflict(
    app: tauri::AppHandle,
    operation: String,
    policy: String,
    apply_all: bool,
) -> Result<(), FileError> {
    app.state::<Archives>()
        .operation(&operation)?
        .resolve(policy, apply_all)
}
pub fn respond(archives: &Archives, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let origin = request
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let allowed = matches!(
        origin,
        "" | "http://tauri.localhost"
            | "https://tauri.localhost"
            | "tauri://localhost"
            | "http://127.0.0.1:1420"
            | "http://localhost:1420"
    );
    let cors = if origin.is_empty() {
        "http://tauri.localhost"
    } else {
        origin
    };
    let error = |code: u16| {
        Response::builder()
            .status(code)
            .header(
                "Access-Control-Allow-Origin",
                if allowed { cors } else { "null" },
            )
            .body(vec![])
            .unwrap()
    };
    if !allowed {
        return error(403);
    }
    if request.method() == "OPTIONS" {
        return Response::builder()
            .status(204)
            .header("Access-Control-Allow-Origin", cors)
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range")
            .body(vec![])
            .unwrap();
    }
    if request.method() != "GET" && request.method() != "HEAD" {
        return error(405);
    }
    let parts: Vec<_> = request.uri().path().trim_matches('/').split('/').collect();
    if parts.len() != 2 {
        return error(404);
    }
    let Ok(session) = archives.get(parts[0]) else {
        return error(404);
    };
    let Ok(id) = parts[1].parse::<usize>() else {
        return error(404);
    };
    let Ok(entry) = session.entry(id) else {
        return error(404);
    };
    let Some((start, end)) = crate::media::parse_range(
        request.headers().get("range").and_then(|v| v.to_str().ok()),
        entry.size,
    ) else {
        return error(416);
    };
    let mut body = vec![];
    if request.method() == "GET" {
        let mut at = start;
        while at <= end {
            let n = (end - at + 1).min(1024 * 1024) as usize;
            match session.read(id, at, n) {
                Ok(b) if b.len() == n => body.extend_from_slice(&b),
                _ => return error(500),
            }
            at += n as u64;
        }
    }
    Response::builder()
        .status(206)
        .header("Content-Type", "application/octet-stream")
        .header("Accept-Ranges", "bytes")
        .header(
            "Content-Length",
            if request.method() == "HEAD" {
                entry.size
            } else {
                body.len() as u64
            },
        )
        .header(
            "Content-Range",
            format!("bytes {start}-{end}/{}", entry.size),
        )
        .header("Access-Control-Allow-Origin", cors)
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length",
        )
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .unwrap()
}

#[tauri::command]
pub fn archive_release_entry(app: tauri::AppHandle, session: String, entry: usize) {
    if let Ok(s) = app.state::<Archives>().get(&session) {
        let mut pins = s.pins.lock().unwrap();
        if let Some(n) = pins.get_mut(&entry) {
            *n = n.saturating_sub(1);
        }
    }
}
