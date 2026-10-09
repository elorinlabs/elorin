import { formatDate } from "../i18n";
import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../i18n";
import { emit } from '@tauri-apps/api/event';
import { NewFileDialog } from '../document/NewFileDialog';
import type { NewDocumentRequest } from '../document/create-options';
import '../workspace/productivity.css';
import { SettingsCenter } from '../platform/SettingsCenter';
import { FileLibrary } from '../pages/home/FileLibrary';
import { useUiSettings, uiSettingsStore } from '../platform/ui-settings';
import { formatIconClass } from '../formats/presentation';

import { ScrollbarSystem } from '../components/common/ScrollbarSystem';
import { openFocusWindow } from '../services/focusWindow';
import { writeClipboard } from '../document/clipboard';
import { platformIntegration } from '../platform/integration';
import { fileWatchService } from '../platform/file-watch';
import { Palette } from '../commands/Palette';
import { viewerCommands } from '../commands/viewer-bridge';
import type { Command } from '../commands/registry';
import { tabId, physicalIdentity, closableTabs, validManifest, workspaceManifest, type TabSession, type WorkspaceManifest } from '../workspace/workspace';
import { recentFilesService } from '../services/recentFiles';
import { SearchSurface } from '../search/SearchSurface';
import { CompareView, type CompareSession } from '../compare/CompareView';
import { DesktopPolicy } from "../components/shell/DesktopPolicy";
import { DocumentSurface } from '../document/DocumentSurface';
import { createDocument } from '../document/create';
import { documentSessions, documentIdentity, type DocumentKind } from '../document/session';
import { discardDocuments, flushRecovery, snapshot } from '../document/recovery';
import { invoke } from '@tauri-apps/api/core';
import { saveDocument } from '../document/save-service';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { viewerSessionStore } from '../viewer/core/session';
import { DocumentDialog, documentChoice } from '../document/dialog';
import { PrismTitleBar } from "../components/shell/PrismTitleBar";
import { ContextMenu } from "../components/shell/ContextMenu";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Copy, X, FileText, Folder } from "lucide-react";
import { Sidebar } from "../components/shell/Sidebar";
import {
  IconButton,
  SearchInput,
  Surface,
  Tooltip,
} from "../components/common/ui";
import { Home } from "../pages/home/Home";
import { primaryRoutes, libraryRoutes, type RouteId } from "./routes";
import { useSidebar } from "../hooks/useSidebar";
import {
  fileSelectionService,
  selectionFromPath,
  type FileSelectionService,
  type Selection,
} from "../services/fileSelection";
import type { RecentFilesService } from "../services/recentFiles";
import {
  fileLoader,
  FileLoadError,
  type FileLoader,
} from "../services/fileLoader";
import type { FileDescriptor } from "../types/files";
import {
  BrowserFileSource,
  TauriFileSource,
  type FileSource,
  fileServices,
} from "../services/fileSource";
import { ViewerHost } from "../viewer/components/ViewerHost";
import { useTheme } from "../hooks/useTheme";
import { FileInspector } from "../components/files/FileInspector";
export function App({
  selectionService = fileSelectionService,
  recentService,
  loader = fileLoader,
  mode = isTauri() ? "tauri" : "browser",
}: {
  selectionService?: FileSelectionService;
  recentService?: RecentFilesService;
  loader?: FileLoader;
  mode?: "tauri" | "browser";
}) {
  useLocale();
  const { theme, setTheme } = useTheme();
  const uiSettings = useUiSettings();
  useEffect(() => { void uiSettingsStore.load().catch(e => setNotice(uiError(e))); const fail=(e:Event)=>setNotice((e as CustomEvent<string>).detail);window.addEventListener('elorin-ui-error',fail);return()=>window.removeEventListener('elorin-ui-error',fail); }, []);
  const [route, setRoute] = useState<RouteId>("home");
  const { collapsed, toggle, restore: restoreSidebar } = useSidebar();
  const search = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Selection[]>([]);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [descriptors, setDescriptors] = useState<FileDescriptor[]>([]);
  const [documents, setDocuments] = useState<TabSession[]>([]);
  const [palette, setPalette] = useState<'commands' | 'quick' | 'tabs' | 'compare'>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [compare, setCompare] = useState<CompareSession>();

  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentFilesService.list>>>([]);
  const closedTabs = useRef<{ file: FileDescriptor }[]>([]);
  const closing = useRef(false);
  const [workspaceReady, setWorkspaceReady] = useState(!isTauri());
  const activeIndex = useRef(0);
  const restoring = useRef(new Set<string>());
  const documentOwners = useRef(documents);
  useEffect(() => {
    const next = new Set(documents.map((d) => d.source));
    for (const old of documentOwners.current)
      if (!next.has(old.source)) old.source.dispose?.();
    documentOwners.current = documents;
  }, [documents]);
  useEffect(
    () => () => {
      for (const d of documentOwners.current) d.source.dispose?.();
    },
    [],
  );
  const [activeFile, setActiveFile] = useState(0);
  activeIndex.current = activeFile;
  const sidebarCollapsed = useRef(collapsed);
  sidebarCollapsed.current = collapsed;
  const currentManifest = () => workspaceManifest(documentOwners.current.map(tab => {
    const session = documentSessions.get(tab.source);
    return session?.path && session.path !== tab.file.path ? { ...tab, file: { ...tab.file, path: session.path, name: session.path.split(/[\\/]/).pop()! } } : tab;
  }), activeIndex.current, sidebarCollapsed.current);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void uiSettingsStore.load().then(()=>platformIntegration.read<WorkspaceManifest>('workspace')).then(async value => {
      if (cancelled) return;
      if (validManifest(value) && uiSettingsStore.snapshot().rememberWorkspace) {
          restoreSidebar(value.sidebarCollapsed);
        const tabs: TabSession[] = value.tabs.map(t => { const source = new TauriFileSource(t.path); viewerSessionStore.restore(source, t.viewState); return { id: t.id, file: {...t.file,path:t.path}, source, status: 'restoring', lastFocusedAt: t.lastFocusedAt }; });
        setDocuments(previous => { if (previous.length) { tabs.forEach(tab => tab.source.dispose?.()); return previous; } return tabs; });
        setActiveFile(value.activeTabId ? Math.max(0,tabs.findIndex(t=>tabId(t)===value.activeTabId)) : -1);
      }
    }).catch(() => setNotice(tr("Previous workspace could not be loaded. Starting fresh."))).finally(() => { if (!cancelled) setWorkspaceReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (!workspaceReady) return; const persist = () => { if(!uiSettingsStore.snapshot().rememberWorkspace)return; void platformIntegration.write('workspace',currentManifest()).catch(()=>setNotice(tr("Workspace could not be saved."))); }; const timer = setTimeout(persist,500); let stateTimer: ReturnType<typeof setTimeout>; const significant = () => { clearTimeout(stateTimer); stateTimer=setTimeout(persist,1000); }; window.addEventListener('elorin-view-state',significant); return () => { clearTimeout(timer); clearTimeout(stateTimer); window.removeEventListener('elorin-view-state',significant); }; },[documents,activeFile,collapsed,workspaceReady]);
  useEffect(() => { const tab=documents[activeFile]; if (!tab || tab.status !== 'restoring' || !tab.file.path || restoring.current.has(tabId(tab))) return; const id=tabId(tab); restoring.current.add(id); void platformIntegration.authorizeReference(tab.file.path).then(()=>loader.loadPath(tab.file.path!)).then(file=>setDocuments(previous=>previous.map(t=>tabId(t)===id?{...t,file,status:undefined}:t)),()=>setDocuments(previous=>previous.map(t=>tabId(t)===id?{...t,status:'unavailable'}:t))).finally(()=>restoring.current.delete(id)); },[documents,activeFile,loader]);
  useEffect(() => { if (!workspaceReady || !isTauri()) return; let cancelled=false, stop:(()=>void)|undefined; const take=()=>{ void platformIntegration.takeLaunch().then(paths=>{ if(!cancelled && paths.length)void inspect(paths); }); }; void platformIntegration.listenLaunch(take).then(fn=>{if(cancelled)fn();else{stop=fn;take();}}); return()=>{cancelled=true;stop?.();}; },[workspaceReady]);
  useEffect(() => { const refresh=()=>void recentFilesService.list().then(setRecent).catch(()=>{}); refresh(); window.addEventListener('elorin-recent-change',refresh); return()=>window.removeEventListener('elorin-recent-change',refresh); },[]);
  const watchOwners = useRef(new Map<FileSource,()=>void>());
  useEffect(() => { const live = new Set(documents.map(t=>t.source)); for(const [source,stop] of watchOwners.current)if(!live.has(source)){stop();watchOwners.current.delete(source);} for(const tab of documents){ if(!tab.file.path || tab.file.virtual || tab.status || watchOwners.current.has(tab.source))continue; watchOwners.current.set(tab.source,fileWatchService.subscribe(tab.file.path,kind=>{if(documentSessions.has(tab.source))return;void loader.loadPath(tab.file.path!).catch(()=>{if(mounted.current)setDocuments(previous=>previous.map(t=>t.source===tab.source?{...t,status:'unavailable'}:t));});setNotice(tr("{v0}: source {v1}. Reopen to refresh.", { v0: tab.file.name, v1: tr(kind.includes('Remove')?'unavailable':'changed externally') }));})); } },[documents]);
  useEffect(()=>()=>{watchOwners.current.forEach(stop=>stop());watchOwners.current.clear();},[]);
  const [newMenu, setNewMenu] = useState(false);
  useEffect(() => { if (isTauri()) return; const unload = (event: BeforeUnloadEvent) => { if (documentOwners.current.some(d => documentSessions.get(d.source)?.dirty)) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, []);
  const [, documentRevision] = useState(0);
  useEffect(() => { const update = () => documentRevision(n => n + 1); window.addEventListener('elorin-document-change', update); return () => window.removeEventListener('elorin-document-change', update); }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false, stop: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async event => {
      const dirty = documentOwners.current.filter(d => documentSessions.get(d.source)?.dirty);
      event.preventDefault();
      try {
        if (await discardDocuments(dirty.map(d => d.source), syncSaved)) { if(uiSettingsStore.snapshot().rememberWorkspace)await platformIntegration.write('workspace',currentManifest()); await platformIntegration.flush(); await flushRecovery(); await getCurrentWindow().destroy(); }
      } catch { setNotice(tr("Workspace could not be saved. Please try closing again.")); }
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void invoke<[string, string][]>('document_recovery_list').then(async snapshots => {
      for (const [id, raw] of snapshots) {
        if (cancelled) return;
        try { const data = JSON.parse(raw); if (data.version !== 1 || typeof data.text !== 'string' || !['text','markdown','json','jsonl','csv'].includes(data.kind)) continue;
          const choice = await documentChoice(tr("Recovered document: {v0}. Last edit: {v1}. Restore opens a new document for safe Save As.", { v0: data.path ?? 'Untitled', v1: formatDate(new Date(data.time), {dateStyle:'short',timeStyle:'medium'}) }), ['Restore', 'Discard', 'Cancel']);
          if (choice === 'Restore') { const restored = await newDocument(data.kind, data.text); const session = documentSessions.get(restored.source)!; session.bom = !!data.bom; session.csvHeader = typeof data.header === 'boolean' ? data.header : undefined; session.csvColumns = Number.isInteger(data.columns) && data.columns >= 0 && data.columns <= 256 ? data.columns : undefined; if (data.csvDraft && Number.isInteger(data.csvDraft.row) && data.csvDraft.row >= 0 && data.csvDraft.row < 100000 && Number.isInteger(data.csvDraft.column) && data.csvDraft.column >= 0 && data.csvDraft.column < 256 && typeof data.csvDraft.value === 'string' && data.csvDraft.value.length <= 2 * 1024 * 1024) session.csvDraft = data.csvDraft; await snapshot(session); }
          else if (choice !== 'Discard') continue;
          await invoke('document_recovery', { id, content: null });
        } catch { setNotice(tr("A recovery snapshot could not be restored.")); }
      }
    }).catch(() => setNotice(tr("Recovery storage could not be read.")));
    return () => { cancelled = true; };
  }, []);
  async function newDocument(kind: DocumentKind, content?: string) {
    if (documentOwners.current.length >= 128) throw Error('128 tabs are open. Close a tab before creating another document.');
    const document = await createDocument(kind, content);
    setDocuments(previous => { setActiveFile(previous.length); return [...previous, document]; });
    setNewMenu(false);
    return document;
  }
  async function createFromDialog(request: NewDocumentRequest) {
    if (documentOwners.current.length >= 128) throw Error('128 tabs are open. Close a tab before creating another document.');
    const document = await createDocument(request.kind, request.content, { name: request.name, location: request.location });
    setDocuments(previous => { setActiveFile(previous.length); return [...previous, document]; });
    setNewMenu(false);
    if(document.file.path)await recentFilesService.add(document.file).catch(e=>setNotice(uiError(e)));
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!document.querySelector('[aria-modal="true"]')) setNewMenu(true); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const browserInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current++;
    };
  }, []);
  async function inspect(inputs: (string | File)[]) {
    const id = ++requestId.current;
    setBusy(true);
    setDescriptors([]);
    setLoadErrors([]);
    const results: FileDescriptor[] = [];
    const sources: FileSource[] = [];
    const errors: string[] = [];
    if (inputs.length > 128)
      errors.push("Only the first 128 files are opened at once.");
    for (const input of inputs.slice(0, 128)) {
      if (id !== requestId.current || !mounted.current) { sources.forEach(source => source.dispose?.()); return; }
      try {
        const file =
          typeof input === "string"
            ? await loader.loadPath(input)
            : await loader.loadBrowserFile(input);
        results.push(file);
        const source: FileSource =
          typeof input === "string"
            ? new TauriFileSource(file.path ?? input)
            : new BrowserFileSource(input);
        if (typeof input !== "string")
          source.resolveRelated = async (relative: string) => {
            const { safeResourcePath } =
              await import("../viewer/plugins/geometry/resource-resolver");
            const safe = safeResourcePath(relative);
            const parent = (input.webkitRelativePath || input.name)
              .split("/")
              .slice(0, -1)
              .join("/");
            const target = [parent, safe].filter(Boolean).join("/");
            const matches = inputs.filter(
              (other): other is File =>
                typeof other !== "string" &&
                (other.webkitRelativePath || other.name) === target,
            );
            if (matches.length !== 1)
              throw Error("Missing or ambiguous selected sibling resource");
            const sibling = matches[0];
            return {
              file: await loader.loadBrowserFile(sibling),
              source: new BrowserFileSource(sibling),
            };
          };
        sources.push(source);
      } catch (error) {
        const failure = FileLoadError.from(error);
        errors.push(
          `${typeof input === "string" ? input : input.name}: ${failure.code} — ${failure.message}`,
        );
      }
    }
    if (id !== requestId.current || !mounted.current) { sources.forEach(source => source.dispose?.()); return; }
    if (id === requestId.current && mounted.current) {
      setDocuments((previous) => {
        const next = [...previous];
        let active = -1;
        results.forEach((file, index) => {
          const existing = file.path
            ? next.findIndex((document) => document.file.path && physicalIdentity(document.file.path) === physicalIdentity(file.path!))
            : -1;
          if (existing >= 0) {
            if (next[existing].status) { next[existing].source.dispose?.(); next[existing] = {...next[existing], file, source:sources[index], status:undefined}; } else sources[index].dispose?.();
            active = existing;
          } else {
            if (next.length >= 128) { sources[index].dispose?.(); setNotice(tr("128 tabs are open. Close a tab before opening another file.")); return; }
            next.push({ id: crypto.randomUUID(), file, source: sources[index], lastFocusedAt: Date.now() });
            active = next.length - 1;
          }
        });
        // Keep file handles and browser references bounded, like the native grant cache.
        if (active >= 0) setActiveFile(active);
        return next;
      });
      setDescriptors(results);
      setLoadErrors(errors);
      setBusy(false);
      for(const file of results)if(file.path&&!file.virtual)await recentFilesService.add(file).catch(()=>{});
      window.dispatchEvent(new Event('elorin-recent-change'));
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search.current?.focus();
      }
      if (event.key === "Escape") {
        search.current?.blur();
        setNotice("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    selectionService
      .listenDrop((paths) => {
        setSelected(paths.map((path) => selectionFromPath(path, "drop")));
        setHover(false);
        void inspect(paths);
      }, setHover)
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        if (!disposed)
          setNotice(
            tr("Drag and drop could not be initialized. Please restart the desktop app."),
          );
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [selectionService, loader]);
  async function choose(kind: "file" | "folder") {
    if (busy) return;
    if (mode === "browser") {
      if (kind === "file") browserInput.current?.click();
      else
        setNotice(
          tr("Browser Preview Mode cannot provide an absolute folder path. Use Tauri Full Mode for Open Folder."),
        );
      return;
    }
    let operationId = ++requestId.current;
    setBusy(true);
    try {
      if (kind === 'file' && selectionService.selectMany) {
        const results = await selectionService.selectMany();
        if (operationId !== requestId.current || !mounted.current) return;
        if (results.length) { setSelected(results); operationId = requestId.current + 1; await inspect(results.map(item=>item.path)); }
        return;
      }
      const result = await selectionService.select(kind);
      if (operationId !== requestId.current || !mounted.current) return;
      if (result) {
        setSelected([result]);
        if (kind === "file") {
          operationId = requestId.current + 1;
          await inspect([result.path]);
        } else {
          setNotice(tr("Folder selected. Open an individual file to view its contents."));
        }
      }
    } catch (error) {
      if (operationId === requestId.current && mounted.current)
        setNotice(FileLoadError.from(error).message);
    } finally {
      if (operationId === requestId.current && mounted.current) setBusy(false);
    }
  }
  async function syncSaved(original: FileSource, path: string) {
    const owner = documentOwners.current.find(tab => tab.source === original);
    if (!owner) return;
    const file = await loader.loadPath(path);
    if (!mounted.current || !documentOwners.current.some(tab => tab.source === original)) return;
    const duplicates=documentOwners.current.filter(tab=>tab.source!==original && tab.file.path && physicalIdentity(tab.file.path)===physicalIdentity(path));
    if(duplicates.some(tab=>documentSessions.get(tab.source)?.dirty))throw Error('Another open document has unsaved changes at this path.');
    const session = documentSessions.get(original), source = new TauriFileSource(path);
    viewerSessionStore.transfer(original, source);
    if (session) { session.source = source; session.sourceDescriptor = file; documentSessions.delete(original); documentSessions.set(source, session); }
    const current=documentOwners.current[activeIndex.current];
    const next = documentOwners.current.filter(tab=>!duplicates.includes(tab)).map(tab => tab.source === original ? { ...tab, id: tabId(tab), file, source } : tab);
    for(const duplicate of duplicates){documentSessions.delete(duplicate.source);duplicate.source.dispose?.();}
    if(current)setActiveFile(next.findIndex(tab=>tabId(tab)===tabId(current)));
    documentOwners.current = next; setDocuments(next); original.dispose?.();
    await recentFilesService.add(file);
    if(isTauri() && owner.file.path && physicalIdentity(owner.file.path) === physicalIdentity(path)) void emit('elorin://file-saved', {tabId: tabId(owner), path}).catch(e=>setNotice(uiError(e)));
  }
  const activeDocument = documents[activeFile];
  useEffect(()=>{const external=(event:Event)=>{const {source}=(event as CustomEvent).detail;const tab=documentOwners.current.find(t=>t.source===source);const session=tab&&documentSessions.get(source);if(!tab?.file.path||!session)return;void(async()=>{try{await invoke('document_reload',{path:tab.file.path});const disk=new TauriFileSource(tab.file.path!);const rightText=await disk.readText({encoding:session.encoding,maxBytes:4*1024*1024});setCompare({left:tab,right:{...tab,source:disk},leftText:session.currentState,rightText,title:`Unsaved ${tab.file.name} ↔ External disk version`});}catch(e){setNotice(uiError(e));}})();};window.addEventListener('elorin-compare-external',external);return()=>window.removeEventListener('elorin-compare-external',external);},[]);
  async function closeTabs(index: number, scope: 'one'|'others'|'right' = 'one') {
    if (closing.current) return;
    const targets=closableTabs(documentOwners.current,index,scope); if(!targets.length)return;
    closing.current = true;
    try {
      if (!await discardDocuments(targets.map(t=>t.source), syncSaved)) return;
      if(isTauri())for(const tab of targets)void emit('elorin://file-closed',{tabId:tabId(tab)}).catch(()=>setNotice(tr("Focus window close notification failed.")));
      closedTabs.current=[...closedTabs.current,...targets.map(tab => ({file: {...tab.file, path: documentOwners.current.find(t=>tabId(t)===tabId(tab))?.file.path ?? tab.file.path}}))].slice(-20);
      const ids=new Set(targets.map(tabId)), current=documentOwners.current[activeIndex.current];
      const next=documentOwners.current.filter(t=>!ids.has(tabId(t)));
      for (const tab of documentOwners.current) if (ids.has(tabId(tab))) tab.source.dispose?.();
      documentOwners.current = next; setDocuments(next);
      setActiveFile(current&&!ids.has(tabId(current))?next.findIndex(t=>tabId(t)===tabId(current)):Math.min(index,next.length-1));
      setCompare(undefined); setSearchOpen(false);
    } finally { closing.current = false; }
  }
  async function reopenTab() { const tab=closedTabs.current.pop(); if(!tab)return; if(tab.file.path&&!tab.file.virtual){await inspect([tab.file.path]);return;} setNotice(tr("This virtual or browser source was released. Reopen it from its container or choose the file again.")); }
  async function openRecent(path:string) { try { if(!isTauri()){setNotice(tr("Recent physical files can be reopened in the desktop app."));return;}await platformIntegration.authorizeReference(path);await inspect([path]); }catch{setNotice(tr("File unavailable. Choose its current location with Open File."));} }
  const [, commandRevision] = useState(0);
  useEffect(()=>{const update=()=>commandRevision(n=>n+1);window.addEventListener('elorin-viewer-commands',update);return()=>window.removeEventListener('elorin-viewer-commands',update);},[]);
  const commands:Command[] = [
    {id:'open',get title() { return tr("Open File"); },scope:'Global',shortcut:'Ctrl+O',execute:()=>choose('file')},
    {id:'new',get title() { return tr("New File"); },scope:'Global',shortcut:'Ctrl+N',execute:()=>setNewMenu(true)},
    {id:'close',get title() { return tr("Close Tab"); },scope:'Tab',enabled:!!activeDocument,shortcut:'Ctrl+W',execute:()=>closeTabs(activeFile)},
    {id:'reopen',get title() { return tr("Reopen Closed Tab"); },scope:'Workspace',enabled:closedTabs.current.length>0,shortcut:'Ctrl+Shift+T',execute:reopenTab},
    {id:'close-others',get title() { return tr("Close Other Tabs"); },scope:'Tab',enabled:documents.length>1,execute:()=>closeTabs(activeFile,'others')},
    {id:'close-right',get title() { return tr("Close Tabs to Right"); },scope:'Tab',enabled:activeFile>=0&&activeFile<documents.length-1,execute:()=>closeTabs(activeFile,'right')},
    {id:'quick',get title() { return tr("Quick Open"); },scope:'Global',shortcut:'Ctrl+P',execute:()=>setPalette('quick')},
    {id:'tabs',get title() { return tr("Switch Tab"); },scope:'Workspace',shortcut:'Ctrl+Shift+A',execute:()=>setPalette('tabs')},
    {id:'search',get title() { return tr("Search Open Tabs"); },scope:'Workspace',enabled:documents.length>0,execute:()=>setSearchOpen(true)},
    {id:'compare',get title() { return tr("Compare with Open Tab"); },scope:'Tab',enabled:documents.length>1,execute:()=>setPalette('compare')},
    {id:'sidebar',get title() { return tr("Toggle Sidebar"); },scope:'Global',execute:toggle},
    {id:'focus',get title() { return tr("Toggle Focus Mode"); },scope:'Global',execute:()=>{if(activeDocument)return openFocusWindow(activeDocument,theme).then(()=>{});}},
    {id:'recent-clear',get title() { return tr("Clear Recent Files"); },scope:'Global',execute:()=>recentFilesService.clear()},
    ...(activeDocument ? [
      {id:'path',get title() { return tr("Copy Path"); },scope:'Tab' as const,execute:()=>writeClipboard(activeDocument.file.virtual?.trail.join(' › ')??activeDocument.file.path??activeDocument.file.name)},
      ...(isTauri()&&activeDocument.file.path&&!activeDocument.file.virtual ? [{id:'reveal',get title() { return tr("Show in Folder"); },scope:'Tab' as const,execute:()=>platformIntegration.reveal(activeDocument.file.path!)},{id:'external',get title() { return tr("Open with System Default"); },scope:'Tab' as const,execute:()=>platformIntegration.externalOpen(activeDocument.file.path!)}]:[]),
      ...viewerCommands.get(activeDocument.source).filter(a=>!a.id.startsWith('can')).map(a=>({id:`viewer:${a.id}`,title:a.label,scope:['save','save-as','enter-edit'].includes(a.id)?'Edit' as const:'Viewer' as const,enabled:!a.disabled,shortcut:a.shortcut,execute:a.action})),
    ]:[]),
  ];
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!(e.ctrlKey||e.metaKey)||e.isComposing)return;const k=e.key.toLowerCase();if(document.querySelector('[aria-modal="true"],.productivity-palette'))return;
    if(k==='p'){e.preventDefault();setPalette(e.shiftKey?'commands':'quick');}
    else if(k==='o'){e.preventDefault();void choose('file');}
    else if(k==='w'){e.preventDefault();void closeTabs(activeFile);}
    else if(k==='t'&&e.shiftKey){e.preventDefault();void reopenTab();}
    else if(k==='a'&&e.shiftKey){e.preventDefault();setPalette('tabs');}
    else if(e.key==='Tab'){e.preventDefault();setActiveFile(i=>(i+(e.shiftKey?-1:1)+documents.length)%Math.max(1,documents.length));}
    else if(k==='f'&&!documentSessions.has(activeDocument?.source as object)){e.preventDefault();e.stopImmediatePropagation();const action=activeDocument&&!activeDocument.file.isText&&viewerCommands.get(activeDocument.source).find(a=>a.id==='search'&&!a.disabled);if(action)void action.action();else setSearchOpen(true);}
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  const paletteCommands:Command[] = palette==='commands'?commands:documents.filter(t=>palette!=='compare'||t!==activeDocument).map(tab=>({id:tabId(tab),title:tab.file.name,category:tab.file.path??tab.file.virtual?.trail.join(' › ')??tr('Unsaved document'),scope:'Tab' as const,keywords:tab.file.path??'',execute:()=>{if(palette==='compare'&&activeDocument)setCompare({left:activeDocument,right:tab});else setActiveFile(documents.indexOf(tab));}})).concat(palette==='quick'?recent.filter(r=>!documents.some(t=>t.file.path===r.path)).map(r=>({id:`recent:${r.id}`,title:r.name,category:r.path,scope:'Tab' as const,keywords:r.path,execute:()=>{void openRecent(r.path);}})):[]);
  useEffect(()=>{const collect=(event:Event)=>{const{id,actions}=(event as CustomEvent).detail;const index=documents.findIndex(t=>tabId(t)===id),tab=documents[index];if(!tab)return;actions.push({id:'close',get label() { return tr("Close Tab"); },action:()=>closeTabs(index)},{id:'others',get label() { return tr("Close Others"); },action:()=>closeTabs(index,'others')},{id:'right',get label() { return tr("Close Tabs to Right"); },action:()=>closeTabs(index,'right')},{id:'reopen',get label() { return tr("Reopen Closed Tab"); },disabled:!closedTabs.current.length,action:reopenTab},{id:'rename-unavailable',label:tr('Rename')+' — '+tr('Unavailable'),disabled:true,action:()=>{}},{id:'delete-unavailable',label:tr('Delete')+' — '+tr('Unavailable'),disabled:true,action:()=>{}},{id:'copy-path',get label() { return tr("Copy Path"); },action:()=>writeClipboard(tab.file.virtual?.trail.join(' › ')??tab.file.path??tab.file.name)});if(isTauri()&&tab.file.path&&!tab.file.virtual)actions.push({id:'reveal',get label() { return tr("Show in Folder"); },action:()=>platformIntegration.reveal(tab.file.path!)},{id:'external',get label() { return tr("Open with System Default"); },action:()=>platformIntegration.externalOpen(tab.file.path!)});};window.addEventListener('elorin-tab-context-actions',collect);return()=>window.removeEventListener('elorin-tab-context-actions',collect);});
  const activeSource = useRef<FileSource | undefined>(undefined);
  activeSource.current = activeDocument?.source;
  const serviceCache=useRef(new WeakMap<FileSource,ReturnType<typeof fileServices>>());
  const viewerServices = useMemo(() => {
    if (!activeDocument) return undefined;
    const existing=serviceCache.current.get(activeDocument.source);if(existing)return existing;
    const services = fileServices(activeDocument.file);
    services.file.openRecent=openRecent;
    if(isTauri()&&activeDocument.file.path&&!activeDocument.file.virtual)services.file.focus=()=>openFocusWindow(activeDocument,theme).then(()=>{});
    if (activeDocument.source.resolveRelated)
      services.file.readRelated = activeDocument.source.resolveRelated;
    services.file.openResource = async (resource) => {
      if (!mounted.current || activeSource.current !== activeDocument.source) {
        resource.source.dispose?.();
        return;
      }
      setDocuments((previous) => {
        if (previous.length >= 128) { resource.source.dispose?.(); setNotice(tr("128 tabs are open. Close a tab before opening another file.")); return previous; }
        const next = [
          ...previous,
          { ...resource, parentSource: activeDocument.source },
        ];
        setActiveFile(next.length - 1);
        return next;
      });
      setDescriptors([resource.file]);
    };
    if (services.file.readRelated)
      services.file.openRelated = async (relative) => {
        const id = requestId.current;
        const related = await services.file.readRelated!(relative);
        if (!mounted.current) { related.source.dispose?.(); return; }
        // Navigation is owned by App; the plugin knows neither routes nor target types.
        if (
          activeSource.current !== activeDocument.source ||
          id !== requestId.current
        ) { related.source.dispose?.(); return; }
        const file = related.file;
        setDocuments((previous) => {
          if (previous.length >= 128) { related.source.dispose?.(); setNotice(tr("128 tabs are open. Close a tab before opening another file.")); return previous; }
          const next = [...previous, related];
          setActiveFile(next.length - 1);
          return next;
        });
        setDescriptors([file]);
      };
    serviceCache.current.set(activeDocument.source,services);return services;
  }, [activeDocument]);
  useEffect(() => { document.querySelector<HTMLElement>('.file-tab[data-active="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'}); }, [activeFile, documents.length]);
  const retainedLight=useRef<FileSource[]>([]);
  retainedLight.current=retainedLight.current.filter(source=>documents.some(tab=>tab.source===source));
  if(activeDocument&&!activeDocument.status&&activeDocument.file.size<=2*1024*1024&&['text','markdown','json','csv','tsv'].includes(activeDocument.file.detectedType))retainedLight.current=[...retainedLight.current.filter(s=>s!==activeDocument.source&&documents.some(t=>t.source===s)),activeDocument.source].slice(-4);
  const title =
    [...primaryRoutes, ...libraryRoutes].find((item) => item.id === route)
      ?.label ?? tr("Settings");
  return (
    <div
      className={`app-shell status-${uiSettings.statusBar} ${collapsed ? "compact" : ""} ${activeDocument ? "has-document" : ""}`}
      onDragOver={(event) => {
        if (mode === "browser") {
          event.preventDefault();
          setHover(true);
        }
      }}
      onDragLeave={(event) => {
        if (
          mode === "browser" &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        )
          setHover(false);
      }}
      onDrop={(event) => {
        if (mode === "browser") {
          event.preventDefault();
          setHover(false);
          setSelected([]);
          void inspect(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <PrismTitleBar title={activeDocument ? tr("File preview") : title} />
      <ContextMenu />
      <DesktopPolicy /><DocumentDialog /><ScrollbarSystem />
      {newMenu && <NewFileDialog onClose={() => setNewMenu(false)} onCreate={createFromDialog} existingNames={documents.map(d => d.file.name)}/>}
      {palette && <Palette title={palette==='commands'?tr("Command Palette"):palette==='compare'?tr("Compare with Tab"):palette==='tabs'?tr("Switch Tab"):tr("Quick Open")} commands={paletteCommands} close={()=>setPalette(undefined)} onError={setNotice}/>}
      <input
        ref={browserInput}
        className="browser-file-input"
        type="file"
        multiple
        aria-label={tr("Choose browser file")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) {
            setSelected([]);
            void inspect(files);
          }
        }}
      />
      <Sidebar
        route={route}
        navigate={(next) => {
          setRoute(next);
          setActiveFile(-1);
        }}
        collapsed={collapsed}
        toggle={toggle}
        openFile={() => void choose("file")}
        newFile={() => setNewMenu(true)}
      />
      <div className="workspace">
        <header className="global-bar">
          <nav className="opened-files top-file-tabs" aria-label={tr("Opened files")}>
            <button className="home-tab" aria-pressed={!activeDocument && route === 'home'} onClick={() => { setRoute('home'); setActiveFile(-1); }}>{tr("Home")}</button>
            {documents.map(({file,source},index)=><div className="file-tab" key={tabId(documents[index])} data-elorin-tab={tabId(documents[index])} data-active={activeFile===index}>
              <button title={file.path ?? file.name} draggable aria-pressed={activeFile===index} onAuxClick={event=>{if(event.button===1)void closeTabs(index);}} onClick={()=>setActiveFile(index)} onDragStart={event=>event.dataTransfer.setData('application/x-elorin-tab',tabId(documents[index]))} onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-elorin-tab'))event.preventDefault();}} onDrop={event=>{const id=event.dataTransfer.getData('application/x-elorin-tab');if(!id)return;event.preventDefault();event.stopPropagation();setDocuments(previous=>{const from=previous.findIndex(t=>tabId(t)===id);if(from<0)return previous;const current=previous[activeFile];const next=[...previous];next.splice(index,0,...next.splice(from,1));setActiveFile(next.indexOf(current));return next;});}}><span className={formatIconClass(file.name,file.extension??'')} aria-hidden="true"/><span>{file.name}{documentSessions.get(source)?.dirty?' •':''}</span></button>
              <button className="tab-close" aria-label={tr("Close {v0}", { v0: file.name })} onClick={()=>void closeTabs(index)}><X size={13}/></button>
            </div>)}
            <button aria-label={tr('Switch Tab')} onClick={()=>setPalette('tabs')}>⋯</button>
            <button className="new-tab" aria-label={tr("New tab")} onClick={()=>setNewMenu(true)}>+</button>
          </nav>
          <div className="search-wrap">
            <SearchInput ref={search} placeholder={tr("Search files, content, or folders…")} onClick={()=>setPalette('quick')} onKeyDown={e=>{if(e.key==='Enter')setPalette('quick');}} />
          </div>
          <div className="global-actions">
            <button onClick={() => setNewMenu(true)}>{tr("New")}</button>
            <select
              aria-label={tr("Theme")}
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as "light" | "dark" | "system")
              }
            >
              <option value="light">{tr("Light")}</option>
              <option value="dark">{tr("Dark")}</option>
              <option value="system">{tr("System")}</option>
            </select>
            <Tooltip label={tr("Workspace")}>
              <IconButton
                aria-label={tr("Workspace options")}
                onClick={() => setPalette('commands')}
              >
                <Copy size={20} />
              </IconButton>
            </Tooltip>
          </div>
        </header>
        <main id="main-content" aria-busy={busy}>

          {busy && (
            <p className="loading-status" role="status">
              {tr("Inspecting file metadata and detection sample…")}</p>
          )}
          {loadErrors.length > 0 && (
            <Surface className="file-errors" role="alert">
              {loadErrors.map((message, index) => (
                <p key={index}>{tr(message)}</p>
              ))}
            </Surface>
          )}
          {documents[activeFile] && (
            <>
              <div className="opened-file-actions">
                <button
                  onClick={async () => {
                    requestId.current++;
                    setDescriptors([]);
                    setActiveFile(-1);
                    setRoute('home');
                    setSelected([]);
                    setBusy(false);
                  }}
                >
                  {tr("Back to workspace")}</button>
                <button onClick={() => void choose("file")}>{tr("Open File")}</button>
                <button disabled={!activeDocument?.file.path||!!activeDocument?.file.virtual} onClick={()=>{if(activeDocument)void openFocusWindow(activeDocument,theme).catch(e=>setNotice(uiError(e)));}}>{tr("Focus View")}</button>
                <button onClick={()=>void closeTabs(activeFile)}>{tr("Close Tab")}</button>
                <button onClick={()=>setPalette('quick')}>{tr("Quick Open")}</button>
                <button onClick={() => void choose("folder")}>
                  {tr("Open Folder")}</button>
              </div>
              {activeDocument?.parentSource && (
                <nav className="resource-trail" aria-label={tr("Container trail")}>
                  <button
                    onClick={async () => {
                      const index = documents.findIndex(
                        (d) => d.source === activeDocument.parentSource,
                      );
                      if (index >= 0) setActiveFile(index);
                    }}
                  >
                    {tr("Back to container")}</button>
                  <span>
                    {activeDocument.file.virtual?.trail.join(" › ") ??
                      activeDocument.file.name}
                  </span>
                </nav>
              )}
              {compare ? <CompareView session={compare} close={()=>setCompare(undefined)}/> : activeDocument?.status ? <section role="status"><h2>{activeDocument.status==='unavailable'?tr("File unavailable"):tr("Restoring file…")}</h2>{activeDocument.status==='unavailable'&&<><button onClick={()=>void choose('file')}>{tr("Locate")}</button><button onClick={()=>void closeTabs(activeFile)}>{tr("Remove from Session")}</button></>}</section> : documents.filter(tab=>tab===activeDocument||retainedLight.current.includes(tab.source)).filter(tab=>!tab.status).map(tab=><div className="tab-surface" hidden={tab!==activeDocument} key={documentIdentity(tab.source)}><DocumentSurface active={tab===activeDocument} file={tab.file} source={tab.source} services={tab===activeDocument?viewerServices:serviceCache.current.get(tab.source)} onSaved={path => syncSaved(tab.source, path)}><ViewerHost
                file={tab.file}
                source={tab.source}
                suspended={busy && tab===activeDocument}
                active={tab===activeDocument}
                services={tab===activeDocument?viewerServices:serviceCache.current.get(tab.source)}
              /></DocumentSurface></div>)}
              {searchOpen && <SearchSurface tabs={documents} active={activeFile} activate={setActiveFile} close={()=>setSearchOpen(false)}/>}
            </>
          )}
          {descriptors.length > 0 && (
            <details className="file-inspector-details">
              <summary>{tr("File Inspector")}</summary>
              <FileInspector
                files={
                  documents[activeFile]
                    ? [documents[activeFile].file]
                    : descriptors
                }
                onDismiss={async () => {
                  requestId.current++;
                  setDescriptors([]);
                  if (!await discardDocuments(documentOwners.current.map(d => d.source))) return;
          setDocuments([]);
                  setLoadErrors([]);
                  setSelected([]);
                  setBusy(false);
                }}
              />
            </details>
          )}
          {!documents[activeFile] &&
            (route === "home" ? (
              <Home
                openFile={() => void choose("file")}
                openFolder={() => void choose("folder")}
                newFile={() => setNewMenu(true)}
                navigate={(next) => {
                  setRoute(next);
                  setActiveFile(-1);
                }}
                recentService={recentService}
                openRecent={path=>void openRecent(path)}
                onNotice={setNotice}
              />
            ) : route==='settings' ? <SettingsCenter theme={theme} setTheme={setTheme} onError={setNotice}/> : (
              <FileLibrary route={route} title={title} openFile={()=>void choose('file')} openRecent={path=>void openRecent(path)} onError={setNotice} recentService={recentService}/>
            ))}
          {selected.length > 0 && descriptors.length === 0 && (
            <Surface className="selection-result" role="status">
              <div className="section-heading">
                <h2>
                  {selected[0].kind === "folder"
                    ? tr("Selected Folder")
                    : selected[0].kind === "drop"
                      ? tr("Dropped Paths")
                      : tr("Selected File")}
                </h2>
                <IconButton
                  aria-label={tr("Dismiss selection")}
                  onClick={async () => {
                    requestId.current++;
                    setSelected([]);
                    setDescriptors([]);
                    if (!await discardDocuments(documentOwners.current.map(d => d.source))) return;
          setDocuments([]);
                    setLoadErrors([]);
                    setBusy(false);
                  }}
                >
                  <X size={18} />
                </IconButton>
              </div>
              {selected.map((item) => (
                <div key={item.path}>
                  <strong>{item.filename}</strong>
                  <p>{item.path}</p>
                </div>
              ))}
            </Surface>
          )}
        </main>
      </div>
      {hover && (
        <div className="drop-overlay">
          <Folder size={38} />
          <h2>{tr("Drop anything here")}</h2>
          <p>{tr("Release to select the local paths.")}</p>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <IconButton
            aria-label={tr("Dismiss message")}
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

