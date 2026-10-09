//! The OS owns its menu, command handling, move/size loops and close-request delivery.
//! This command accepts no handles, paths or arbitrary system command identifiers.
#[cfg(windows)]
pub const COMPATIBILITY_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-gpu --disable-gpu-compositing";
fn validate_label(label: &str) -> Result<(), String> {
    if label == "main" || (label.starts_with("focus-") && uuid::Uuid::parse_str(&label[6..]).is_ok()) { Ok(()) } else { Err("Window chrome is only available for managed viewer windows".into()) }
}

#[derive(serde::Serialize)]
pub struct ChromeState { maximized: bool, focused: bool }

/// Caption activation follows the foreground top-level window, not keyboard focus
/// transferred between the parent HWND and its WebView2 child.
#[tauri::command]
pub fn window_chrome_state(window: tauri::WebviewWindow) -> Result<ChromeState, String> {
    validate_label(window.label())?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsZoomed};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as _;
        Ok(ChromeState { maximized: unsafe { IsZoomed(hwnd) != 0 }, focused: unsafe { GetForegroundWindow() == hwnd } })
    }
    #[cfg(not(windows))]
    { Ok(ChromeState { maximized: window.is_maximized().map_err(|e| e.to_string())?, focused: window.is_focused().map_err(|e| e.to_string())? }) }
}

#[tauri::command]
pub async fn window_system_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    validate_label(window.label())?;
    #[cfg(windows)]
    {
        use std::sync::{atomic::{AtomicBool, Ordering}, mpsc};
        use windows_sys::Win32::{Foundation::POINT, UI::WindowsAndMessaging::*};
        static OPEN: AtomicBool = AtomicBool::new(false);
        if OPEN.swap(true, Ordering::AcqRel) {
            return Err("System menu is already open".into());
        }
        let (sender, receiver) = mpsc::sync_channel(1);
        let owner = window.clone();
        if let Err(error) = window.run_on_main_thread(move || {
            // This window is held alive for the callback. HWND never crosses IPC.
            let result = (|| -> Result<(), String> {
                let hwnd = owner.hwnd().map_err(|e| e.to_string())?.0 as _;
                unsafe {
                    let menu = GetSystemMenu(hwnd, 0);
                    if menu.is_null() { return Err("Windows system menu is unavailable".into()); }
                    let maximized = IsZoomed(hwnd) != 0;
                    for (command, disabled) in [(SC_RESTORE, !maximized), (SC_MAXIMIZE, maximized), (SC_MOVE, maximized), (SC_SIZE, maximized)] {
                        EnableMenuItem(menu, command, MF_BYCOMMAND | if disabled { MF_GRAYED } else { MF_ENABLED });
                    }
                    let mut point = POINT { x: 0, y: 0 };
                    if GetCursorPos(&mut point) == 0 { return Err("Cannot obtain the system cursor position".into()); }
                    let command = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, point.x, point.y, 0, hwnd, std::ptr::null()) as u32;
                    if command != 0 && PostMessageW(hwnd, WM_SYSCOMMAND, command as usize, 0) == 0 {
                        return Err("Windows rejected the system menu command".into());
                    }
                }
                Ok(())
            })();
            OPEN.store(false, Ordering::Release);
            let _ = sender.send(result);
        }) {
            OPEN.store(false, Ordering::Release);
            return Err(error.to_string());
        }
        tauri::async_runtime::spawn_blocking(move || receiver.recv().map_err(|e| e.to_string()))
            .await.map_err(|e| e.to_string())??
    }
    #[cfg(not(windows))]
    { Err("Windows system menu is unavailable on this platform".into()) }
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(windows)]
    fn main_and_focus_use_the_same_software_compositor_policy() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &config["app"]["windows"][0];
        assert_eq!(main["additionalBrowserArgs"].as_str(), Some(super::COMPATIBILITY_BROWSER_ARGS));
        assert_eq!(main["fullscreen"], false);
        assert_eq!(main["alwaysOnTop"], false);
    }
    #[test]
    fn chrome_rejects_other_windows() {
        assert!(super::validate_label("main").is_ok());
        for label in ["", "preview", "main\0", "MAIN"] { assert!(super::validate_label(label).is_err()); }
    }
}
