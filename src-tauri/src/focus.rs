//! Focus is a real top-level WebView window. Sources must already be granted by main.
use std::{collections::HashMap,path::Path,sync::Mutex};
use serde::{Deserialize,Serialize};
use tauri::{Manager,WebviewUrl,WebviewWindowBuilder};
use crate::{file_io::{FileAccess,FileError},detection::descriptor::FileDescriptor};
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct FocusSnapshot { pub file:FileDescriptor,pub view_state:serde_json::Value,pub theme:String,pub tab_id:String }
struct Entry { owner:String, tab:String, snapshot:FocusSnapshot }
#[derive(Default)]pub struct FocusWindows(Mutex<HashMap<String,Entry>>);
impl FocusWindows { pub fn remove(&self,label:&str){self.0.lock().unwrap().remove(label);} }
#[derive(Deserialize)]#[serde(rename_all="camelCase")]
pub struct FocusRequest { tab_id:String,path:String,view_state:serde_json::Value,theme:String }
fn validate(request:&FocusRequest)->Result<(),FileError>{if request.tab_id.len()>128||request.tab_id.is_empty()||serde_json::to_vec(&request.view_state).map_err(|_|FileError::new("INVALID_INPUT","Invalid viewer state"))?.len()>65536||!matches!(request.theme.as_str(),"light"|"dark"|"system"){return Err(FileError::new("INVALID_INPUT","Focus request exceeds its validated state boundary"));}Ok(())}
#[tauri::command]
pub async fn focus_open(app:tauri::AppHandle,window:tauri::WebviewWindow,request:FocusRequest)->Result<String,FileError>{
 if window.label()!="main"{return Err(FileError::new("ACCESS_DENIED","Only main can create a Focus window"));}validate(&request)?;
 let file=app.state::<FileAccess>().load(Path::new(&request.path))?;
 let registry=app.state::<FocusWindows>();
 let label=format!("focus-{}",uuid::Uuid::new_v4());
 let title=format!("{} — Elorin",file.name);
 // Reserve under the same lock as lookup: rapid clicks cannot build duplicate windows.
 {
  let mut entries=registry.0.lock().unwrap();
  let existing=entries.iter().find(|(_,e)|e.owner==window.label()&&e.tab==request.tab_id).map(|(label,_)|label.clone());
  if let Some(existing)=existing {drop(entries);if let Some(win)=app.get_webview_window(&existing){win.unminimize().map_err(|e|FileError::new("WINDOW_FAILED",e.to_string()))?;win.set_focus().map_err(|e|FileError::new("WINDOW_FAILED",e.to_string()))?;}return Ok(existing);}
  if entries.len()>=8{return Err(FileError::new("RESOURCE_LIMIT","At most eight Focus windows may be open"));}
  entries.insert(label.clone(),Entry{owner:window.label().into(),tab:request.tab_id.clone(),snapshot:FocusSnapshot{file,view_state:request.view_state,theme:request.theme,tab_id:request.tab_id}});
 }
 app.state::<crate::window_resources::WindowResources>().reopen(&label);
 let builder=WebviewWindowBuilder::new(&app,&label,WebviewUrl::App("index.html?window=focus".into())).title(title).inner_size(1200.,850.).min_inner_size(640.,480.).decorations(false).fullscreen(false).always_on_top(false).center();
 // Match the main WebView environment: avoid the accelerated compositor on
 // machines where launching WebView2 disrupts the desktop display.
 #[cfg(windows)]
 let builder=builder.additional_browser_args(crate::window_chrome::COMPATIBILITY_BROWSER_ARGS);
 let result=builder.build();
 if let Err(error)=result{registry.remove(&label);return Err(FileError::new("WINDOW_FAILED",error.to_string()));}Ok(label)
}
#[tauri::command]
pub fn focus_take(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<serde_json::Value,FileError>{let registry=app.state::<FocusWindows>();let entries=registry.0.lock().unwrap();let e=entries.get(window.label()).ok_or_else(||FileError::new("ACCESS_DENIED","No Focus state belongs to this window"))?;serde_json::to_value(&e.snapshot).map_err(|_|FileError::new("INVALID_INPUT","Cannot serialize Focus state"))}
#[cfg(test)]mod tests{use super::*;#[test]fn request_is_bounded(){let mut r=FocusRequest{tab_id:"tab".into(),path:"ignored".into(),view_state:serde_json::json!([]),theme:"light".into()};assert!(validate(&r).is_ok());r.view_state=serde_json::json!("x".repeat(65536));assert!(validate(&r).is_err());r.view_state=serde_json::json!([]);r.theme="arbitrary".into();assert!(validate(&r).is_err());}}
