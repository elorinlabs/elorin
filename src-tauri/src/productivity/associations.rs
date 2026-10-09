use crate::file_io::FileError;
use serde_json::{Value,json};
pub fn installed() -> bool { std::env::current_exe().ok().and_then(|p| p.parent().map(|p|p.join("elorin-installed"))).map(|p|p.is_file()).unwrap_or(false) }
#[tauri::command]
pub fn association_health(repair: bool) -> Result<Value, FileError> {
    #[cfg(windows)] {
        use winreg::{RegKey,enums::*};
        let catalogue: Vec<Value> = serde_json::from_str(include_str!("../../../src/platform/associations.json")).map_err(|e|FileError::new("association",e.to_string()))?;
        let hkcu=RegKey::predef(HKEY_CURRENT_USER);
        let exe=std::env::current_exe().map_err(|e|FileError::new("association",e.to_string()))?;
        let command=format!("\"{}\" \"%1\"",exe.display());
        if repair && !installed() { return Err(FileError::new("portable","Portable mode does not register associations")); }
        let mut result=Vec::new();
        for item in catalogue {
            let ext=item["extension"].as_str().unwrap_or("");let category=item["category"].as_str().unwrap_or("");
            if !ext.chars().all(|c|c.is_ascii_alphanumeric()) { continue; }
            let id=format!("Elorin.File.{category}");let base=format!("Software\\Classes\\{id}");
            if repair {
                let write=||->std::io::Result<()>{
                    hkcu.create_subkey(&base)?.0.set_value("",&format!("Elorin {category}"))?;
                    hkcu.create_subkey(format!("{base}\\shell\\open\\command"))?.0.set_value("",&command)?;
                    hkcu.create_subkey(format!("Software\\Classes\\.{ext}\\OpenWithProgids"))?.0.set_value(&id,&"")?;
                    hkcu.create_subkey("Software\\Classes\\Applications\\prism.exe\\SupportedTypes")?.0.set_value(format!(".{ext}"),&"")?;
                    hkcu.create_subkey("Software\\Classes\\Applications\\prism.exe\\shell\\open\\command")?.0.set_value("",&command)?;
                    hkcu.create_subkey("Software\\Classes\\Applications\\prism.exe")?.0.set_value("FriendlyAppName",&"Elorin")?;
                    let capabilities=hkcu.create_subkey("Software\\Elorin\\Capabilities")?.0;
                    capabilities.set_value("ApplicationName",&"Elorin")?;
                    capabilities.set_value("ApplicationDescription",&"Local file viewer")?;
                    capabilities.set_value("ElorinOwnerCommand",&command)?;
                    hkcu.create_subkey("Software\\Elorin\\Capabilities\\FileAssociations")?.0.set_value(format!(".{ext}"),&id)?;
                    hkcu.create_subkey("Software\\RegisteredApplications")?.0.set_value("Elorin",&"Software\\Elorin\\Capabilities")?;
                    Ok(())
                };write().map_err(|e|FileError::new("association",e.to_string()))?;
            }
            let registered=hkcu.open_subkey(format!("{base}\\shell\\open\\command")).and_then(|k|k.get_value::<String,_>(""));
            let default=hkcu.open_subkey(format!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.{ext}\\UserChoice")).and_then(|k|k.get_value::<String,_>("ProgId")).ok();
            let state=match registered {Err(_)=>"Missing",Ok(ref current)if *current!=command=>"Outdated",_=>"Registered"};
            result.push(json!({"extension":ext,"category":category,"recommended":item["recommendedDefault"],"state":state,"default":default.as_ref().map(|v|if *v==id{"Elorin"}else{"Owned by another app"})}));
        }
        Ok(json!({"portable":!installed(),"entries":result}))
    }
    #[cfg(not(windows))] { let _=repair; Ok(json!({"portable":true,"entries":[],"unsupported":true})) }
}
