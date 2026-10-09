#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| productivity::route_launch(app, args, &cwd)))
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(tauri_plugin_window_state::StateFlags::SIZE | tauri_plugin_window_state::StateFlags::POSITION | tauri_plugin_window_state::StateFlags::MAXIMIZED).build())
        .manage(productivity::LaunchQueue::default())
        .manage(file_io::FileAccess::default())
        .manage(document::creation::CreateLocations::default())
        .manage(media::MediaSources::default())
        .manage(data::DataHandles::default())
        .manage(archive::Archives::default())
        .manage(window_resources::WindowResources::default())
        .manage(focus::FocusWindows::default())
        .manage(binary::BinarySessions::default())
        .manage(scientific::ScientificSessions::default())
        .on_page_load(|window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                window.app_handle().state::<window_resources::WindowResources>().close(window.app_handle(),window.label(),false);
            }
        })
        .register_asynchronous_uri_scheme_protocol("prism-science", |context, request, responder| {
            let app=context.app_handle().clone();tauri::async_runtime::spawn_blocking(move||{responder.respond(app.state::<scientific::ScientificSessions>().respond(&app.state::<binary::BinarySessions>(),&app.state::<archive::Archives>(),request));});
        })
        .register_asynchronous_uri_scheme_protocol("prism-vfs", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(archive::commands::respond(
                    &app.state::<archive::Archives>(),
                    request,
                ));
            });
        })
        .register_asynchronous_uri_scheme_protocol("prism-media", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(
                    app.state::<media::MediaSources>()
                        .respond(&app.state::<file_io::FileAccess>(), request),
                );
            });
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(productivity::FileWatches::new(app.handle().clone())?);
            productivity::route_launch(app.handle(), std::env::args().collect(), &std::env::current_dir()?.to_string_lossy());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            user_environment::user_environment,
            focus::focus_open, focus::focus_take,
            window_chrome::window_system_menu,
            window_chrome::window_chrome_state,
            scientific::scientific_open, scientific::scientific_read, scientific::scientific_close, scientific::scientific_pause, scientific::scientific_stats, scientific::scientific_begin, scientific::scientific_finish, scientific::scientific_validate_slice,
            binary::binary_open,
            binary::binary_read,
            binary::binary_close,
            binary::binary_stats,
            binary::binary_search_start,
            binary::binary_search_step,
            binary::binary_search_cancel,
            productivity::launch_take,
            productivity::productivity_read,
            productivity::productivity_write,
            productivity::productivity_open,
            productivity::file_watch,
            productivity::platform_capabilities,
            productivity::default_apps,
            productivity::associations::association_health,
            document::document_fingerprint,
            document::document_save,
            document::creation::document_create_locations,
            document::creation::document_pick_location,
            document::creation::document_name_available,
            document::creation::document_create,
            document::document_reload,
            document::recovery::document_recovery,
            document::recovery::document_recovery_list,
            data::data_sqlite_open,
            data::data_sqlite_read,
            data::data_sqlite_close,
            commands::select_path,
            commands::select_paths,
            commands::load_file,
            commands::read_file_range,
            commands::file_size,
            commands::open_file_external,
            commands::reveal_file,
            commands::load_related_file,
            commands::file_revision,
            commands::decode_image_preview,
            commands::open_external_url,
            commands::register_media_source,
            commands::release_media_source,
            archive::commands::archive_open,
            archive::commands::archive_release_entry,
            archive::commands::archive_list,
            archive::commands::archive_prepare_entry,
            archive::commands::archive_read_entry,
            archive::commands::archive_close,
            archive::commands::archive_extract,
            archive::commands::archive_extraction_status,
            archive::commands::archive_cancel_extraction,
            archive::commands::archive_resolve_conflict
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(false)) && window.is_minimized().unwrap_or(false) {
                window.app_handle().state::<window_resources::WindowResources>().pause(window.app_handle(),window.label());
            }
            if matches!(event,tauri::WindowEvent::Destroyed) {
                window.app_handle().state::<window_resources::WindowResources>().close(window.app_handle(),window.label(),true);
                window.app_handle().state::<focus::FocusWindows>().remove(window.label());
                if window.label()=="main" { for (label,child) in window.app_handle().webview_windows() { if label.starts_with("focus-") { let _=child.destroy(); } } }
            }
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let paths = paths.clone();
                let app = window.app_handle().clone();
                let label = window.label().to_owned();
                tauri::async_runtime::spawn_blocking(move || {
                    use tauri::Emitter;
                    for path in paths.iter().take(32) {
                        if let Err(error) = app.state::<file_io::FileAccess>().grant(path) {
                            eprintln!("Dropped path was not granted: {}", error.code);
                        }
                    }
                    // Publish only after grants exist, so frontend invocations cannot race authorization.
                    let names: Vec<_> = paths
                        .iter()
                        .take(33)
                        .map(|p| p.to_string_lossy().into_owned())
                        .collect();
                    if let Err(error) = app.emit_to(label, "prism://files-dropped", names) {
                        eprintln!("Drop notification failed: {error}");
                    }
                });
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Prism")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<scientific::ScientificSessions>().close_all(&app.state::<binary::BinarySessions>());
                app.state::<binary::BinarySessions>().close_all();
            }
        });
}
mod commands;
mod window_chrome;
pub mod detection;
pub mod file_io;
mod image_decode;
pub mod media;
use tauri::Manager;

pub mod archive;
pub mod binary;
pub mod scientific;

pub mod data;
pub mod document;
pub mod productivity;

mod window_resources;
mod focus;

mod user_environment;
