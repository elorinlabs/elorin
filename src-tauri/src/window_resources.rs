//! Window-owned resources. Registration rejects late work after an owner is destroyed.
use std::{collections::{HashMap, VecDeque}, sync::Mutex};
use tauri::Manager;
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum Kind { Binary, Scientific, Archive, Media, Database }
#[derive(Default)]
struct Owners { resources: HashMap<(Kind,String),String>, closed: VecDeque<String> }
#[derive(Default)]
pub struct WindowResources(Mutex<Owners>);
impl WindowResources {
 pub fn register(&self, owner:&str, kind:Kind, id:&str)->bool { let mut state=self.0.lock().unwrap();if state.closed.iter().any(|v|v==owner){return false;}state.resources.insert((kind,id.into()),owner.into());true }
 pub fn forget(&self,kind:Kind,id:&str){self.0.lock().unwrap().resources.remove(&(kind,id.into()));}
 pub fn reopen(&self,owner:&str){self.0.lock().unwrap().closed.retain(|v|v!=owner);}
 fn take(&self,owner:&str,destroyed:bool)->Vec<(Kind,String)>{let mut state=self.0.lock().unwrap();if destroyed {state.closed.retain(|v|v!=owner);state.closed.push_back(owner.into());if state.closed.len()>64{state.closed.pop_front();}}let keys:Vec<_>=state.resources.iter().filter(|(_,v)|v.as_str()==owner).map(|(k,_)|k.clone()).collect();for k in &keys{state.resources.remove(k);}keys}
 pub fn pause(&self,app:&tauri::AppHandle,owner:&str){let keys:Vec<_>=self.0.lock().unwrap().resources.iter().filter(|(_,v)|v.as_str()==owner).map(|(k,_)|k.clone()).collect();for(kind,id)in keys{match kind{Kind::Binary=>app.state::<crate::binary::BinarySessions>().pause(&id),Kind::Scientific=>app.state::<crate::scientific::ScientificSessions>().pause(&id,true),_=>{}}}}
 pub fn close(&self,app:&tauri::AppHandle,owner:&str,destroyed:bool){let mut keys=self.take(owner,destroyed);keys.sort_by_key(|(k,_)|match k{Kind::Scientific=>0,Kind::Binary=>1,Kind::Database=>2,Kind::Media=>3,Kind::Archive=>4});for(kind,id)in keys{dispose(app,kind,&id);}}
}
pub fn dispose(app:&tauri::AppHandle,kind:Kind,id:&str){match kind{Kind::Binary=>app.state::<crate::binary::BinarySessions>().close(id),Kind::Scientific=>app.state::<crate::scientific::ScientificSessions>().close(id,&app.state::<crate::binary::BinarySessions>()),Kind::Archive=>app.state::<crate::archive::Archives>().close(id),Kind::Media=>app.state::<crate::media::MediaSources>().release(id),Kind::Database=>crate::data::data_sqlite_close(app.clone(),id.into())}}
pub fn register(app:&tauri::AppHandle,owner:&str,kind:Kind,id:&str)->Result<(),crate::file_io::FileError>{if app.get_webview_window(owner).is_some()&&app.state::<WindowResources>().register(owner,kind,id){Ok(())}else{dispose(app,kind,id);Err(crate::file_io::FileError::new("SOURCE_CLOSED","The owner window has closed"))}}
#[cfg(test)]mod tests{use super::*;#[test]fn isolated_and_late_registration(){let r=WindowResources::default();assert!(r.register("main",Kind::Binary,"a"));assert!(r.register("focus-a",Kind::Binary,"b"));assert_eq!(r.take("main",true),vec![(Kind::Binary,"a".into())]);assert!(!r.register("main",Kind::Media,"late"));assert_eq!(r.take("focus-a",false),vec![(Kind::Binary,"b".into())]);r.reopen("main");assert!(r.register("main",Kind::Binary,"c"));}#[test]fn forget(){let r=WindowResources::default();r.register("main",Kind::Binary,"a");r.forget(Kind::Binary,"a");assert!(r.take("main",false).is_empty());}}
