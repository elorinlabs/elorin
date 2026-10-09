#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEnvironment { pub locale: Option<String>, pub preferred_languages: Vec<String>, pub region: Option<String>, pub windows_time_zone: Option<String> }
#[tauri::command]
pub fn user_environment() -> UserEnvironment {
    #[cfg(windows)] {
        use windows_sys::Win32::Globalization::{GetUserDefaultGeoName, GetUserDefaultLocaleName, GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
        let mut locale = [0u16; 85]; let mut region = [0u16; 16]; let mut count = 0u32; let mut length = 0u32;
        unsafe {
            GetUserDefaultLocaleName(locale.as_mut_ptr(), locale.len() as i32);
            GetUserDefaultGeoName(region.as_mut_ptr(), region.len() as i32);
            GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, std::ptr::null_mut(), &mut length);
        }
        let mut languages = vec![0u16; length.min(16384) as usize];
        if !languages.is_empty() { length = languages.len() as u32; let ok = unsafe { GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, languages.as_mut_ptr(), &mut length) }; if ok == 0 { languages.clear(); } }
        let decode = |s: &[u16]| { let end = s.iter().position(|&c| c == 0).unwrap_or(s.len()); let text = String::from_utf16_lossy(&s[..end]); if text.is_empty() { None } else { Some(text) } };
        let preferred_languages = languages.split(|&c| c == 0).filter_map(decode).collect();
        let windows_time_zone = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE)
            .open_subkey("SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation").ok()
            .and_then(|key| key.get_value::<String, _>("TimeZoneKeyName").ok());
        UserEnvironment { locale: decode(&locale), preferred_languages, region: decode(&region), windows_time_zone }
    }
    #[cfg(not(windows))] {
        let locale = std::env::var("LC_ALL").or_else(|_| std::env::var("LANG")).ok().map(|v| v.split('.').next().unwrap_or(&v).replace('_', "-"));
        UserEnvironment { preferred_languages: locale.clone().into_iter().collect(), locale, region: None, windows_time_zone: None }
    }
}

