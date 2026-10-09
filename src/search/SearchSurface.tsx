import { t as tr, useUiLanguage as useLocale } from "../i18n";
import { useEffect, useState } from 'react';
import type { TabSession } from '../workspace/workspace';
import { tabId } from '../workspace/workspace';
import { sourceSearchProvider, type SearchHit } from './providers';
export function SearchSurface({ tabs, active, activate, close }: { tabs: TabSession[]; active: number; activate(index: number): void; close(): void }) {
  useLocale();
  const [query, setQuery] = useState(''), [scope, setScope] = useState('current'), [rows, setRows] = useState<{ tab: TabSession; index: number; hit: SearchHit }[]>([]), [status, setStatus] = useState('');
  useEffect(() => {
    const task = new AbortController(); setRows([]); setStatus(''); if (!query.trim()) return () => task.abort();
    const timer = setTimeout(() => { void (async () => { setStatus(tr('Searching…')); const targets = tabs.map((tab, index) => ({ tab, index })).filter(t => scope === 'tabs' || t.index === active); let cursor = 0, count = 0, limited = false, unavailable = 0;
      await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => { while (cursor < targets.length && !task.signal.aborted) { const {tab,index} = targets[cursor++]; const provider = sourceSearchProvider(tab.file, tab.source); if (!provider || tab.status) { unavailable++; continue; } try { const result = await provider.search(query, task.signal); if (task.signal.aborted) return; const hits = result.hits.slice(0, Math.max(0, 1000-count)); count += hits.length; limited ||= result.limited || hits.length < result.hits.length; setRows(previous => [...previous, ...hits.map(hit => ({tab,index,hit}))]); } catch { if (!task.signal.aborted) unavailable++; } } }));
      if (!task.signal.aborted) setStatus(tr('{v0} matches',{v0:count})+(limited?tr(' · More results available'):'')+(unavailable?tr(' · {v0} tabs do not provide source search or are not loaded',{v0:unavailable}):''));
    })(); }, 180); return () => { clearTimeout(timer); task.abort(); };
  }, [query, scope, tabs, active]);
  return <section className="productivity-search" aria-label={tr("Workspace search")}><header><input autoFocus aria-label={tr("Search content")} value={query} onChange={e => setQuery(e.target.value)} /><select aria-label={tr("Content search scope")} value={scope} onChange={e => setScope(e.target.value)}><option value="current">{tr("Current File")}</option><option value="tabs">{tr("Open Tabs")}</option></select><button onClick={close}>{tr("Close search")}</button></header><small>{tr("Source text search · viewer search remains available in Viewer controls")}</small><p role="status">{tr(status)}</p><div>{rows.map((r,i) => <button key={`${tabId(r.tab)}:${i}`} onClick={() => { activate(r.index); sourceSearchProvider(r.tab.file,r.tab.source)?.navigateTo(r.hit); }}><strong>{r.tab.file.name}</strong><span>{r.hit.context}</span><small>{tr("Line")}{' '}{r.hit.line}</small></button>)}</div></section>;
}
