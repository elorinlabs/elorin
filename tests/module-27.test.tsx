import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { platformIntegration } from '../src/platform/integration';
import { recentFilesService } from '../src/services/recentFiles';
import { physicalIdentity, validManifest, closableTabs } from '../src/workspace/workspace';
import { DocumentSession, documentSessions } from '../src/document/session';
import { discardDocuments } from '../src/document/recovery';
import { DocumentDialog } from '../src/document/dialog';
import { BrowserFileSource } from '../src/services/fileSource';
import { NewFileDialog } from '../src/document/NewFileDialog';
import { Home } from '../src/pages/home/Home';
import { setUiLanguage } from '../src/i18n';

beforeEach(()=>{localStorage.clear();setUiLanguage('en');});
afterEach(()=>{vi.restoreAllMocks();documentSessions.clear();});
describe('Module 27 workspace safety',()=>{
 it('serializes concurrent recent additions and clear in invocation order',async()=>{
  await Promise.all(['A','B','C'].map(name=>recentFilesService.add({path:`C:\\qa\\${name}.txt`,name,extension:'txt'})));
  expect((await recentFilesService.list()).map(f=>f.name)).toEqual(['C','B','A']);
  await Promise.all([recentFilesService.add({path:'c:/QA/a.txt',name:'A2',extension:'txt'}),recentFilesService.clear()]);
  expect(await recentFilesService.list()).toEqual([]);
 });
 it('deduplicates Windows path aliases and signals updated real data',async()=>{
  const changed=vi.fn();window.addEventListener('elorin-recent-change',changed);
  await recentFilesService.add({path:'C:\\QA\\note.txt',name:'old',extension:'txt'});
  await recentFilesService.add({path:'c:/qa/NOTE.txt',name:'new',extension:'txt'});
  expect(await recentFilesService.list()).toHaveLength(1);expect(changed).toHaveBeenCalledTimes(2);
  window.removeEventListener('elorin-recent-change',changed);
  expect(physicalIdentity('\\\\?\\C:\\QA\\note.txt')).toBe(physicalIdentity('c:/qa/note.txt'));
 });
 it('rejects malformed, duplicated and virtual restore entries without throwing',()=>{
  const file={name:'note.txt',size:10};const tab={id:'one',path:'C:\\qa\\note.txt',file};
  const valid={version:1,id:'default',tabs:[tab],sidebarCollapsed:false};
  expect(validManifest(valid)).toBe(true);
  for(const tabs of [[null],[{...tab,file:{...file,size:-1}}],[tab,{...tab,id:'two',path:'c:/QA/NOTE.txt'}],[tab,{...tab,path:'C:\\qa\\other.txt'}]])expect(validManifest({...valid,tabs})).toBe(false);
  expect(closableTabs([],-1,'others')).toEqual([]);
 });
 it('Cancel preserves dirty session and recovery ownership',async()=>{
  render(<DocumentDialog/>);const source=new BrowserFileSource(new File(['draft'],'draft.txt'));
  const session=new DocumentSession('draft','text');session.source=source;documentSessions.set(source,session);
  let result!:Promise<boolean>;act(()=>{result=discardDocuments([source]);});
  fireEvent.click(await screen.findByRole('button',{name:'Cancel'}));expect(await result).toBe(false);
  expect(documentSessions.get(source)).toBe(session);expect(session.dirty).toBe(true);
 });
 it('failed creation keeps filename and input focus usable for retry',async()=>{
  const create=vi.fn().mockRejectedValue(Error('Creation failed'));const close=vi.fn();
  render(<NewFileDialog onCreate={create} onClose={close}/>);
  const input=screen.getByRole('textbox',{name:'File name'});fireEvent.change(input,{target:{value:'my-note'}});
  fireEvent.click(screen.getByRole('button',{name:'Create'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Creation failed');expect(input).toHaveValue('my-note');expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Create'}));await waitFor(()=>expect(create).toHaveBeenCalledTimes(2));
 });
 it('Home exposes persisted favorites, full paths and existing creation callback',async()=>{
  await platformIntegration.write('settings',{favorites:[{id:'f',name:'favorite.txt',path:'C:\\qa\\favorite.txt',extension:'txt',lastOpened:1}]});
  const open=vi.fn(),create=vi.fn();render(<Home openFile={()=>{}} openFolder={()=>{}} newFile={create} navigate={()=>{}} onNotice={()=>{}} openRecent={open} recentService={{list:async()=>[]}}/>);
  fireEvent.click(await screen.findByTitle('C:\\qa\\favorite.txt'));expect(open).toHaveBeenCalledWith('C:\\qa\\favorite.txt');
  fireEvent.click(within(screen.getByLabelText('Drag and drop files here')).getByRole('button',{name:'New File'}));expect(create).toHaveBeenCalledOnce();
 });
});
