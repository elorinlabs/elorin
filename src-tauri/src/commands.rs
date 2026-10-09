use crate::{
    detection::descriptor::FileDescriptor,
    file_io::{FileAccess, FileError},
};
use serde::Serialize;
use std::path::Path;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
pub fn register_media_source(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    path: String,
    mime: String,
) -> Result<String, FileError> {
    let token=app.state::<crate::media::MediaSources>().register(
        &app.state::<FileAccess>(),
        Path::new(&path),
        &mime,
    )?;
    crate::window_resources::register(&app,window.label(),crate::window_resources::Kind::Media,&token)?;
    Ok(token)
}
#[tauri::command]
pub fn release_media_source(app: tauri::AppHandle, token: String) {
    app.state::<crate::media::MediaSources>().release(&token);
    app.state::<crate::window_resources::WindowResources>().forget(crate::window_resources::Kind::Media,&token);
}

#[tauri::command]
pub async fn decode_image_preview(
    app: tauri::AppHandle,
    path: String,
) -> Result<tauri::ipc::Response, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::image_decode::jpeg_preview(&app.state::<FileAccess>(), Path::new(&path))
            .map(|image| tauri::ipc::Response::new(image.png))
    })
    .await
    .map_err(|_| FileError::new("IMAGE_DECODE", "Image decode task failed."))?
}

#[derive(Serialize)]
pub struct Selection {
    path: String,
    filename: String,
    kind: &'static str,
}
#[tauri::command]
pub async fn select_path(
    app: tauri::AppHandle,
    directory: bool,
    title: Option<String>,
) -> Result<Option<Selection>, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file().set_title(title.filter(|value| value.len() <= 256).unwrap_or_else(|| if directory {
            "Open Folder".into()
        } else {
            "Open File".into()
        }));
        let picked = if directory {
            dialog.blocking_pick_folder()
        } else {
            dialog.blocking_pick_file()
        };
        let Some(picked) = picked else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(|_| {
            FileError::new("UNSUPPORTED_PATH", "Only filesystem paths are supported.")
        })?;
        if !directory {
            app.state::<FileAccess>().grant(&path)?;
        }
        Ok(Some(Selection {
            filename: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
            kind: if directory { "folder" } else { "file" },
        }))
    })
    .await
    .map_err(|_| FileError::new("READ_FAILED", "The file dialog task failed."))?
}
#[tauri::command]
pub async fn load_file(app: tauri::AppHandle, path: String) -> Result<FileDescriptor, FileError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<FileAccess>().load(Path::new(&path)))
        .await
        .map_err(|_| FileError::new("READ_FAILED", "The file inspection task failed."))?
}

#[tauri::command]
pub async fn read_file_range(
    app: tauri::AppHandle,
    path: String,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<FileAccess>()
            .read_range(Path::new(&path), offset, length)
    })
    .await
    .map_err(|_| FileError::new("READ_FAILED", "File read task failed."))?
}
#[tauri::command]
pub async fn file_size(app: tauri::AppHandle, path: String) -> Result<u64, FileError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<FileAccess>().size(Path::new(&path)))
        .await
        .map_err(|_| FileError::new("READ_FAILED", "File size task failed."))?
}
#[tauri::command]
pub async fn open_file_external(app: tauri::AppHandle, path: String) -> Result<(), FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_opener::OpenerExt;
        let path = app
            .state::<FileAccess>()
            .authorized_path(Path::new(&path))?;
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|_| FileError::new("READ_FAILED", "The system could not open this file."))
    })
    .await
    .map_err(|_| FileError::new("READ_FAILED", "External open task failed."))?
}
#[tauri::command]
pub async fn reveal_file(app: tauri::AppHandle, path: String) -> Result<(), FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_opener::OpenerExt;
        let path = app
            .state::<FileAccess>()
            .authorized_path(Path::new(&path))?;
        app.opener()
            .reveal_item_in_dir(path)
            .map_err(|_| FileError::new("READ_FAILED", "The system could not reveal this file."))
    })
    .await
    .map_err(|_| FileError::new("READ_FAILED", "Reveal task failed."))?
}

#[tauri::command]
pub async fn load_related_file(
    app: tauri::AppHandle,
    base_path: String,
    relative: String,
) -> Result<FileDescriptor, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<FileAccess>()
            .load_related(Path::new(&base_path), &relative)
    })
    .await
    .map_err(|_| FileError::new("READ_FAILED", "Related file task failed."))?
}
#[tauri::command]
pub async fn file_revision(app: tauri::AppHandle, path: String) -> Result<String, FileError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<FileAccess>().revision(Path::new(&path))
    })
    .await
    .map_err(|_| FileError::new("READ_FAILED", "File revision task failed."))?
}
#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), FileError> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = tauri::Url::parse(&url)
        .map_err(|_| FileError::new("UNSUPPORTED_PATH", "Invalid external URL."))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(FileError::new(
            "UNSUPPORTED_PATH",
            "Only HTTP and HTTPS links are supported.",
        ));
    }
    app.opener()
        .open_url(parsed.to_string(), None::<&str>)
        .map_err(|_| {
            FileError::new(
                "READ_FAILED",
                "The system browser could not open this link.",
            )
        })
}
