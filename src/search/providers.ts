import { t as tr } from "../i18n";
import type { FileDescriptor } from '../types/files';
import type { FileSource } from '../services/fileSource';
import { TextDocumentModel } from '../viewer/plugins/text/text-model';
import { fileServices } from '../services/fileSource';
import { documentSessions } from '../document/session';
import { searchDocument } from '../document/search';
import { viewerSessionStore } from '../viewer/core/session';
import type { TextMatch } from '../viewer/plugins/text/text-engine';
export interface SearchHit { line: number; column: number; length: number; context: string; offset?: number; row?: number; node?: number }
export interface SearchProvider { label: string; search(query: string, signal: AbortSignal): Promise<{ hits: SearchHit[]; limited: boolean }>; navigateTo(hit: SearchHit): void }
const registered=new WeakMap<object,SearchProvider>();
export function registerSearchProvider(source:object,provider:SearchProvider){registered.set(source,provider);return()=>{if(registered.get(source)===provider)registered.delete(source);};}
export function sourceSearchProvider(file: FileDescriptor, source: FileSource): SearchProvider | undefined {
  if(!documentSessions.has(source)){const provider=registered.get(source);if(provider)return provider;if(['csv','tsv'].includes(file.detectedType))return undefined;}
  if (!file.isText) return undefined;
  return {
    get label() { return tr("Source text"); },
    async search(query, signal) {
      const session = documentSessions.get(source);
      if(session?.kind==='csv'){const[{parseEditableCsv},{searchRows}]=await Promise.all([import('../document/csv'),import('../viewer/plugins/csv/csv-query')]);const rows=parseEditableCsv(session.currentState,file.detectedType==='tsv').rows;const result=await searchRows({count:rows.length,get:i=>rows[i]},0,query,undefined,signal);return{limited:result.limited,hits:result.results.map(m=>({line:m.row+1,row:m.row,column:m.column,length:query.length,context:rows[m.row]?.[m.column]??''}))};}
      if (session) { const text = session.currentState.replace(/\r\n|\r/g, '\n'), r = await searchDocument(text, { query, caseSensitive: false, wholeWord: false, regex: false }, signal); return { limited: r.limited, hits: r.matches.slice(0, 500).map(m => ({ line: text.slice(0, m.start).split('\n').length, column: m.start - (text.lastIndexOf('\n', m.start - 1) + 1), length: m.end - m.start, context: text.slice(Math.max(0, m.start - 40), m.end + 80), offset: m.start })) }; }
      const model = new TextDocumentModel({ file, source, signal, services: fileServices(file), onCleanup() {} }, file.size, file.encoding ?? 'utf-8', '');
      const matches: TextMatch[] = []; let limited = false;
      try { await model.search({ query, caseSensitive: false, wholeWord: false, regex: false }, signal, batch => { matches.push(...batch.matches.slice(0, Math.max(0, 500 - matches.length))); limited ||= batch.limited || batch.count > 500; }); return { hits: matches.map(m => ({ ...m, context: `Line ${m.line}, column ${m.column + 1}` })), limited }; } finally { model.dispose(); }
    },
    navigateTo(hit) { viewerSessionStore.update(source, 'core.text-fallback', { metadata: { ...viewerSessionStore.get(source, 'core.text-fallback').metadata, productivityMatch: hit, textScroll: Math.max(0, (hit.line - 3) * 24) } }); if(file.detectedType==='markdown')viewerSessionStore.update(source,'markdown',{mode:'source',metadata:{...viewerSessionStore.get(source,'markdown').metadata,productivityMatch:hit,sourceScroll:Math.max(0,(hit.line-3)*24)}});if(file.detectedType==='json')viewerSessionStore.update(source,'json',{metadata:{...viewerSessionStore.get(source,'json').metadata,productivityMatch:hit}}); window.dispatchEvent(new CustomEvent('elorin-navigate-search', { detail: { source, hit } })); },
  };
}
