import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../../i18n";
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, PanelRight, Maximize, Search, Images, Minus, Plus } from 'lucide-react';
import { PrismTitleBar } from '../../components/shell/PrismTitleBar';
import { ViewerHost } from '../../viewer/components/ViewerHost';
import { TauriFileSource } from '../../services/fileSource';
import { viewerSessionStore } from '../../viewer/core/session';
import { viewerCommands } from '../../commands/viewer-bridge';
import type { ViewerAction } from '../../viewer/core/actions';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import { useUiSettings, uiSettingsStore } from '../../platform/ui-settings';
import { enhanceDescriptor } from '../../formats';
import type { FileDescriptor } from '../../types/files';
import { ScrollbarSystem } from '../../components/common/ScrollbarSystem';

interface Snapshot { tabId: string; file: FileDescriptor; viewState: unknown; theme: ThemePreference }
const temporaryLayer = '.floating-panel,[role=dialog],[role=alertdialog],[role=menu],.viewer-more[open]';
export function FocusWindow() {
  useLocale();
  const [data, setData] = useState<{ file: FileDescriptor; source: TauriFileSource; tabId: string }>();
  const [error, setError] = useState(''), [show, setShow] = useState(true);
  const [actions, setActions] = useState<ViewerAction[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toolbar = useRef<HTMLDivElement>(null), dragging = useRef(false), nearTop = useRef(false);
  const settings = useUiSettings(), { setTheme } = useTheme();
  const interactionLocked = useCallback(() => {
    const active = document.activeElement;
    return dragging.current || !!document.querySelector(temporaryLayer) ||
      !!active?.closest('.focus-top-controls,input,textarea,select,[contenteditable=true]');
  }, []);
  const reveal = useCallback(() => {
    clearTimeout(timer.current); setShow(true);
    if (settings.focusAutoHide && !document.hidden) timer.current = setTimeout(() => {
      if (!interactionLocked() && !nearTop.current) setShow(false);
    }, 2500);
  }, [settings.focusAutoHide, interactionLocked]);
  useEffect(() => {
    let live = true;
    void uiSettingsStore.load().catch(e => { if (live) setError(uiError(e)); });
    void invoke<Snapshot>('focus_take').then(snapshot => {
      if (!live) return;
      const source = new TauriFileSource(snapshot.file.path!);
      viewerSessionStore.restore(source, snapshot.viewState);
      setTheme(snapshot.theme);
      setData({ file: enhanceDescriptor(snapshot.file), source, tabId: snapshot.tabId });
    }, e => { if (live) setError(uiError(e)); });
    return () => { live = false; clearTimeout(timer.current); };
  }, [setTheme]);
  useEffect(() => {
    if (!data) return;
    let queued = false;
    const sync = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!live) return;
        const next = [...new Map(viewerCommands.get(data.source).map(a => [a.id, a])).values()];
        setActions(previous => previous.length === next.length && previous.every((a, i) =>
          a.id === next[i].id && a.disabled === next[i].disabled && a.label === next[i].label) ? previous : next);
      });
    };
    let live = true, stop: (() => void) | undefined;
    sync(); window.addEventListener('elorin-viewer-commands', sync);
    void listen<{ tabId: string }>('elorin://file-closed', event => {
      if (event.payload.tabId === data.tabId && uiSettingsStore.snapshot().focusExitOnFileClose)
        void getCurrentWindow().close().catch(e => setError(uiError(e)));
    }).then(fn => { if (live) stop = fn; else fn(); });
    return () => { live = false; stop?.(); window.removeEventListener('elorin-viewer-commands', sync); };
  }, [data]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'F6' && !e.shiftKey) {
        e.preventDefault(); reveal();
        requestAnimationFrame(() => toolbar.current?.querySelector<HTMLElement>('button:not(:disabled),input,select')?.focus());
      } else if (e.key === 'Escape') {
        // FloatingPanel's capture handler owns Escape before this window handler.
        if (document.querySelector(temporaryLayer)) return;
        void getCurrentWindow().isFullscreen().then(full => {
          if (full) return getCurrentWindow().setFullscreen(false);
          if (toolbar.current?.contains(document.activeElement)) {
            document.querySelector<HTMLElement>('.focus-reading-surface')?.focus(); nearTop.current = false;
          }
          if (settings.focusAutoHide && !interactionLocked()) { clearTimeout(timer.current); setShow(false); }
        }).catch(e => setError(uiError(e)));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const action = data && viewerCommands.get(data.source).find(a => a.id === 'search');
        if (action && !action.disabled) { e.preventDefault(); void Promise.resolve(action.action()).catch(e => setError(uiError(e))); }
        reveal();
      }
    };
    const move = (e: PointerEvent) => { nearTop.current = e.clientY < 96 || !!(e.target as Element)?.closest?.('.focus-top-controls'); if (nearTop.current) reveal(); };
    const down = () => { dragging.current = true; if (interactionLocked()) reveal(); };
    const up = () => { dragging.current = false; reveal(); };
    const focusChanged = () => { reveal(); };
    const hidden = () => { if (document.hidden) clearTimeout(timer.current); else reveal(); };
    // Only layer/open changes restart the timer, not ordinary page rendering.
    const observer = new MutationObserver(records => {
      if (records.some(r => r.type === 'attributes' || [...r.addedNodes, ...r.removedNodes].some(n =>
        n instanceof Element && (n.matches(temporaryLayer) || !!n.querySelector(temporaryLayer))))) reveal();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    window.addEventListener('keydown', key); window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true); window.addEventListener('focusin', focusChanged);
    window.addEventListener('focusout', focusChanged); document.addEventListener('visibilitychange', hidden);
    reveal();
    return () => {
      observer.disconnect(); clearTimeout(timer.current);
      window.removeEventListener('keydown', key); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true); window.removeEventListener('focusin', focusChanged);
      window.removeEventListener('focusout', focusChanged); document.removeEventListener('visibilitychange', hidden);
    };
  }, [data, reveal, interactionLocked, settings.focusAutoHide]);
  const run = (action: ViewerAction) => {
    reveal();
    const current = data && viewerCommands.get(data.source).find(a => a.id === action.id);
    if (current && !current.disabled) void Promise.resolve().then(current.action).catch(e => setError(uiError(e)));
  };
  const tool = (id: string, label: string, icon: ReactNode) => {
    const action = actions.find(a => a.id === id);
    return action && <button key={id} aria-label={label} disabled={action.disabled} data-floating-trigger onClick={() => run(action)}>{icon}</button>;
  };
  return <div className={`focus-window focus-background-${settings.focusBackground}`} style={{ backgroundColor: settings.focusBackgroundColor }}>
    <PrismTitleBar title={data?.file.name ?? tr("Focus View")} /><ScrollbarSystem />
    <div ref={toolbar} className="focus-top-controls" data-visible={show || !settings.focusAutoHide} aria-label={tr("Focus tools")} role="toolbar" onPointerEnter={reveal} onPointerLeave={() => { nearTop.current = false; reveal(); }} onFocus={reveal}>
      <div id="focus-viewer-tools" className="focus-viewer-tools" />
      <div className="focus-common-tools">
        {tool('pdf-zoom-out', 'Zoom out', <Minus size={17} />)}{tool('pdf-zoom-in', 'Zoom in', <Plus size={17} />)}
        {tool('pdf-thumbnails', 'Thumbnails', <Images size={17} />)}{tool('search', 'Find in file', <Search size={17} />)}
        {tool('inspect', 'Inspector', <PanelRight size={17} />)}
        <button aria-label={tr("Toggle full screen")} onClick={() => void getCurrentWindow().isFullscreen().then(v => getCurrentWindow().setFullscreen(!v)).catch(e => setError(uiError(e)))}><Maximize size={17} /></button>
        <button aria-label={tr("Exit Focus View")} onClick={() => void getCurrentWindow().close().catch(e => setError(uiError(e)))}><X size={16} /><span>{tr("Exit Focus")}</span></button>
      </div>
    </div>
    <main className="focus-reading-surface" tabIndex={-1} aria-label={tr("Focus reading area")}>
      {error && <p className="focus-error" role="alert">{tr(error)}</p>}{data && <ViewerHost file={data.file} source={data.source} />}
    </main>
  </div>;
}
