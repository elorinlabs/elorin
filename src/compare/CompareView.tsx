import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../i18n";
import { useEffect, useRef, useState } from 'react';
import type { TabSession } from '../workspace/workspace';
import { documentSessions } from '../document/session';
import type { Change } from 'diff';
export interface CompareSession { left: TabSession; right: TabSession; leftText?: string; rightText?: string; title?: string }
const LIMIT = 4 * 1024 * 1024;
export function CompareView({ session, close }: { session: CompareSession; close(): void }) {
  useLocale();
  const [parts, setParts] = useState<Change[]>(), [error, setError] = useState(''), [sync, setSync] = useState(true), [images, setImages] = useState<string[]>([]), [zoom, setZoom] = useState(100);
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null);
  const image = session.left.file.mimeType?.startsWith('image/') && session.right.file.mimeType?.startsWith('image/');
  useEffect(() => { let stopped = false; const urls: string[] = []; let worker: Worker | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => { try { if ([session.left,session.right].some(t => t.file.size > LIMIT)) throw Error('Compare is limited to 4 MiB per file.');
      if (image) { for (const t of [session.left,session.right]) { if (t.file.mimeType === 'image/svg+xml') throw Error('SVG compare is unavailable; use the existing SVG viewer.'); const blob = await t.source.readBlob?.({type:t.file.mimeType ?? 'image/png',maxBytes:LIMIT}); if (!blob) throw Error('Image source is unavailable.'); urls.push(URL.createObjectURL(blob)); } if (!stopped) setImages([...urls]); return; }
      if (!session.left.file.isText || !session.right.file.isText) throw Error('Source compare supports text, code, Markdown, JSON and CSV.');
      const a = session.leftText ?? documentSessions.get(session.left.source)?.currentState ?? await session.left.source.readText({encoding:session.left.file.encoding ?? 'utf-8',maxBytes:LIMIT});
      const b = session.rightText ?? documentSessions.get(session.right.source)?.currentState ?? await session.right.source.readText({encoding:session.right.file.encoding ?? 'utf-8',maxBytes:LIMIT}); if (stopped) return;
      worker = new Worker(new URL('./diff.worker.ts', import.meta.url), {type:'module'}); timer = setTimeout(() => { worker?.terminate(); if (!stopped) setError(tr("Compare exceeded the 5 second time limit.")); },5000); worker.onmessage = ({data}) => { clearTimeout(timer); worker?.terminate(); if (!stopped) { if(data.error) setError(data.error); else setParts(data.parts); } }; worker.onerror = () => { clearTimeout(timer); worker?.terminate(); if(!stopped)setError(tr("Compare worker failed.")); }; worker.postMessage({left:a,right:b});
    } catch(e) { if(!stopped)setError(uiError(e)); } })();
    return () => { stopped = true; clearTimeout(timer); worker?.terminate(); urls.forEach(url => URL.revokeObjectURL(url)); };
  },[session,image]);
  const scroll = (from: HTMLDivElement, to: HTMLDivElement | null) => { if (sync && to && Math.abs(to.scrollTop-from.scrollTop)>1) { to.scrollTop=from.scrollTop; to.scrollLeft=from.scrollLeft; } };
  return <section className="compare-view" aria-label={tr("Compare files")}><header><strong>{session.title ?? tr("{v0} ↔ {v1}", { v0: session.left.file.name, v1: session.right.file.name })}</strong><label><input type="checkbox" checked={sync} onChange={e => setSync(e.target.checked)} />{tr("Sync scroll")}</label>{image && <label>{tr("Zoom")}<input type="range" min="25" max="200" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>}<button onClick={close}>{tr("Exit Compare")}</button></header>{error ? <p role="alert">{tr(error)}</p> : image ? <div className="compare-columns"><div ref={left} onScroll={e=>scroll(e.currentTarget,right.current)}>{images[0] && <img style={{width:`${zoom}%`}} src={images[0]} alt={session.left.file.name}/>}</div><div ref={right} onScroll={e=>scroll(e.currentTarget,left.current)}>{images[1] && <img style={{width:`${zoom}%`}} src={images[1]} alt={session.right.file.name}/>}</div></div> : !parts ? <p role="status">{tr("Comparing…")}</p> : <div className="compare-columns"><div ref={left} onScroll={e=>scroll(e.currentTarget,right.current)} aria-label={tr("Original source")}>{parts.map((p,i)=><pre key={i} className={p.removed?'diff-removed':p.added?'diff-empty':''}>{p.added?'\n'.repeat(p.count ?? 1):p.value}</pre>)}</div><div ref={right} onScroll={e=>scroll(e.currentTarget,left.current)} aria-label={tr("Compared source")}>{parts.map((p,i)=><pre key={i} className={p.added?'diff-added':p.removed?'diff-empty':''}>{p.removed?'\n'.repeat(p.count ?? 1):p.value}</pre>)}</div></div>}<footer>{tr("Read-only source comparison · red removed / green added · adjacent changes show modified lines")}</footer></section>;
}

