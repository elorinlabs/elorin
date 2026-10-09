use crate::file_io::{FileAccess, FileError};
use std::hash::{BuildHasher, Hasher};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::http::{Request, Response};
#[derive(Default)]
pub struct MediaSources {
    entries: Mutex<HashMap<String, (PathBuf, String)>>,
    serial: AtomicU64,
}
impl MediaSources {
    pub fn register(
        &self,
        access: &FileAccess,
        path: &Path,
        mime: &str,
    ) -> Result<String, FileError> {
        let path = access.authorized_path(path)?;
        if ![
            "application/octet-stream",
            "audio/mpeg",
            "audio/wav",
            "audio/flac",
            "audio/aac",
            "audio/mp4",
            "audio/ogg",
            "audio/opus",
            "audio/x-ms-wma",
            "audio/aiff",
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-matroska",
            "video/x-msvideo",
            "video/mpeg",
        ]
        .contains(&mime)
        {
            return Err(FileError::new(
                "UNSUPPORTED_CONTENT",
                "Unsupported media MIME type.",
            ));
        }
        let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
        hasher.write_u64(self.serial.fetch_add(1, Ordering::Relaxed));
        let first = hasher.finish();
        hasher.write_u128(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
        );
        let token = format!("{:016x}{:016x}", first, hasher.finish());
        let mut entries = self.entries.lock().unwrap();
        if entries.len() >= 32 {
            return Err(FileError::new(
                "READ_FAILED",
                "Too many live media sources.",
            ));
        }
        entries.insert(token.clone(), (path, mime.into()));
        Ok(token)
    }
    pub fn release(&self, token: &str) {
        self.entries.lock().unwrap().remove(token);
    }
    pub fn respond(&self, access: &FileAccess, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
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
        let error = |status: u16| {
            Response::builder()
                .status(status)
                .header(
                    "Access-Control-Allow-Origin",
                    if allowed { cors } else { "null" },
                )
                .body(Vec::new())
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
        let token = request.uri().path().trim_start_matches('/');
        let Some((path, mime)) = self.entries.lock().unwrap().get(token).cloned() else {
            return error(404);
        };
        let Ok(size) = access.size(&path) else {
            return error(403);
        };
        if size == 0 {
            return error(416);
        }
        let range = request.headers().get("range").and_then(|v| v.to_str().ok());
        let (start, end) = match parse_range(range, size) {
            Some(r) => r,
            None => return error(416),
        };
        let length = end - start + 1;
        let mut body = Vec::new();
        if request.method() == "GET" {
            let mut at = start;
            while at <= end {
                let n = (end - at + 1).min(1024 * 1024);
                match access.read_range(&path, at, n) {
                    Ok(b) if b.len() == n as usize => body.extend(b),
                    _ => return error(500),
                }
                at += n;
            }
        }
        let mut response = Response::builder()
            .status(if request.method() == "HEAD" { 200 } else { 206 })
            .header("Content-Type", mime)
            .header("Accept-Ranges", "bytes")
            .header(
                "Content-Length",
                if request.method() == "HEAD" {
                    size
                } else {
                    length
                },
            )
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .header("Access-Control-Allow-Origin", cors)
            .header(
                "Access-Control-Expose-Headers",
                "Content-Range, Content-Length, Accept-Ranges",
            );
        if request.method() != "HEAD" {
            response = response.header("Content-Range", format!("bytes {start}-{end}/{size}"));
        }
        response.body(body).unwrap()
    }
}
pub fn parse_range(range: Option<&str>, size: u64) -> Option<(u64, u64)> {
    if size == 0 {
        return None;
    }
    let (start, requested) = if let Some(r) = range {
        let r = r.strip_prefix("bytes=")?;
        if r.contains(',') {
            return None;
        }
        let (a, b) = r.split_once('-')?;
        if a.is_empty() {
            let n = b.parse::<u64>().ok()?;
            if n == 0 {
                return None;
            }
            (size.saturating_sub(n), size - 1)
        } else {
            (
                a.parse::<u64>().ok()?,
                if b.is_empty() {
                    size - 1
                } else {
                    b.parse::<u64>().ok()?
                },
            )
        }
    } else {
        (0, size - 1)
    };
    if start >= size || requested < start {
        return None;
    }
    Some((
        start,
        requested
            .min(size - 1)
            .min(start.saturating_add(8 * 1024 * 1024 - 1)),
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges_are_bounded() {
        assert_eq!(parse_range(Some("bytes=100-199"), 1000), Some((100, 199)));
        assert_eq!(parse_range(Some("bytes=-10"), 1000), Some((990, 999)));
        assert_eq!(
            parse_range(None, 500_000_000),
            Some((0, 8 * 1024 * 1024 - 1))
        );
        assert!(parse_range(Some("bytes=2-1"), 100).is_none());
        assert!(parse_range(Some("bytes=0-1,5-9"), 100).is_none());
    }
}

#[cfg(test)]
mod security_tests {
    use super::*;
    #[test]
    fn source_requires_grant_and_releases_token() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../test-fixtures/media/video/basic.mp4");
        let access = FileAccess::default();
        let sources = MediaSources::default();
        assert!(sources.register(&access, &path, "video/mp4").is_err());
        access.grant(&path).unwrap();
        assert!(sources.register(&access, &path, "text/html").is_err());
        let token = sources.register(&access, &path, "video/mp4").unwrap();
        let request = |origin: &str, range: &str| {
            Request::builder()
                .uri(format!("http://prism-media.localhost/{token}"))
                .header("Origin", origin)
                .header("Range", range)
                .body(vec![])
                .unwrap()
        };
        assert_eq!(
            sources
                .respond(&access, request("https://evil.example", "bytes=0-99"))
                .status(),
            403
        );
        assert_eq!(
            sources
                .respond(&access, request("http://tauri.localhost", "bytes=2-1"))
                .status(),
            416
        );
        let response = sources.respond(&access, request("http://tauri.localhost", "bytes=100-199"));
        assert_eq!(response.status(), 206);
        assert_eq!(response.body().len(), 100);
        assert!(response.headers()["content-range"]
            .to_str()
            .unwrap()
            .starts_with("bytes 100-199/"));
        sources.release(&token);
        assert_eq!(
            sources
                .respond(&access, request("http://tauri.localhost", "bytes=0-99"))
                .status(),
            404
        );
    }
}
