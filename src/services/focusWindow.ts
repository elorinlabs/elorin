import { invoke, isTauri } from '@tauri-apps/api/core';
import { viewerSessionStore } from '../viewer/core/session';
import { documentSessions } from '../document/session';
import type { TabSession } from '../workspace/workspace';
import { tabId } from '../workspace/workspace';
export async function openFocusWindow(tab:TabSession,theme:string){
 if(!isTauri())throw Error('Independent Focus View is available in the desktop application.');
 if(!tab.file.path||tab.file.virtual)throw Error('This source cannot yet be transferred to an independent window. Open a local file to use Focus View.');
 if(documentSessions.get(tab.source)?.dirty)throw Error('Save your changes before opening this file in Focus View.');
 return invoke<string>('focus_open',{request:{tabId:tabId(tab),path:tab.file.path,viewState:viewerSessionStore.serialize(tab.source),theme}});
}
