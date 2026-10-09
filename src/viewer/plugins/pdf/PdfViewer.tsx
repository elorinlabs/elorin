import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ViewerRenderProps } from "../../core/types";
import { createPortal } from 'react-dom';
import { PdfEngine, type PdfHit, type PdfAnnotation } from "./pdf-engine";
import { classifyMarkdownLink } from "../markdown/markdown-links";
import { FloatingPanel } from '../../../components/common/FloatingPanel';
import {useUiSettings} from '../../../platform/ui-settings';

function Page({
  engine,
  number,
  scale,
  rotation,
  onSize,
  onGo,
  hit,
  thumbnail = false,
}: {
  engine: PdfEngine;
  number: number;
  scale: number;
  rotation: number;
  onSize?: (w: number, h: number) => void;
  onGo: (n: number) => void;
  hit?: PdfHit;
  thumbnail?: boolean;
}) {
  useLocale();
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<{
    text: string;
    ranges: { start: number; end: number }[];
    annotations: PdfAnnotation[];
    viewport: { convertToViewportPoint: (x: number, y: number) => number[] };
  }>();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    setInfo(undefined);
    setError("");
    let active = true;
    const job = engine.render(
      number,
      canvas.current!,
      thumbnail ? null : text.current,
      scale,
      rotation,
      (value) => {
        setInfo(value);
        onSize?.(value.width, value.height);
      },
    );
    job.promise.catch((e) => {
      if (
        active &&
        e?.name !== "RenderingCancelledException" &&
        !engine.disposed
      )
        setError(tr("This page could not be rendered."));
    });
    return () => {
      active = false;
      job.cancel();
    };
  }, [engine, number, scale, rotation, thumbnail]);
  useEffect(() => {
    if (!text.current || !info) return;
    let index = 0;
    for (const span of text.current.querySelectorAll("span")) {
      const value = span.textContent ?? "",
        range = info.ranges[index++];
      span.replaceChildren(document.createTextNode(value));
      if (!hit || !range || range.start >= hit.end || range.end <= hit.start)
        continue;
      const start = Math.max(0, hit.start - range.start),
        end = Math.min(value.length, hit.end - range.start),
        mark = document.createElement("mark");
      mark.textContent = value.slice(start, end);
      span.replaceChildren(
        document.createTextNode(value.slice(0, start)),
        mark,
        document.createTextNode(value.slice(end)),
      );
    }
  }, [hit, info]);
  return (
    <div
      className="pdf-page"
      data-rendered={info ? "true" : "false"}
      aria-label={tr("Page {v0}", { v0: number })}
    >
      <canvas ref={canvas} />
      {!thumbnail && (
        <>
          <div className="textLayer" ref={text} />
          <div className="pdf-annotations">
            {info?.annotations.map((annotation, i) => {
              if (!annotation.rect) return null;
              const rect = [
                  ...info.viewport.convertToViewportPoint(
                    annotation.rect[0],
                    annotation.rect[1],
                  ),
                  ...info.viewport.convertToViewportPoint(
                    annotation.rect[2],
                    annotation.rect[3],
                  ),
                ],
                style = {
                  left: Math.min(rect[0], rect[2]),
                  top: Math.min(rect[1], rect[3]),
                  width: Math.abs(rect[2] - rect[0]),
                  height: Math.abs(rect[3] - rect[1]),
                };
              if (annotation.subtype === "Link") {
                const link = classifyMarkdownLink(annotation.url);
                return (
                  <button
                    key={i}
                    style={style}
                    aria-label={
                      annotation.url ? tr("Open PDF link") : tr("Go to linked page")
                    }
                    disabled={!annotation.dest && link.kind !== "external"}
                    onClick={() => {
                      if (annotation.dest)
                        void engine
                          .destination(annotation.dest)
                          .then((n) => n && onGo(n))
                          .catch(() => setNote("Linked page is unavailable."));
                      else if (link.kind === "external")
                        void engine.context.services.file
                          .openUrl?.(link.target)
                          .catch(() =>
                            setNote("This link could not be opened."),
                          );
                    }}
                  />
                );
              }
              if (annotation.subtype === "Widget")
                return (
                  <span key={i} style={style} title={tr("Read-only form field")} />
                );
              if (annotation.contentsObj?.str)
                return (
                  <button
                    key={i}
                    style={style}
                    title={String(annotation.contentsObj.str).slice(0, 2000)}
                    aria-label={tr("Annotation note")}
                    onClick={() =>
                      setNote(
                        String(annotation.contentsObj?.str ?? "").slice(
                          0,
                          2000,
                        ),
                      )
                    }
                  />
                );
              return null;
            })}
          </div>
          {info && !info.text && engine.copyAllowed && (
            <span className="pdf-no-text">
              {tr("No text detected · OCR is unavailable")}</span>
          )}
        </>
      )}
      {error && <p role="alert">{tr(error)}</p>}
      {note && (
        <div className="pdf-note" role="status">
          <p>{note}</p>
          <button onClick={() => setNote("")}>{tr("Close note")}</button>
        </div>
      )}
    </div>
  );
}
function Thumbnails({
  engine,
  current,
  rotation,
  onGo,
}: {
  engine: PdfEngine;
  current: number;
  rotation: number;
  onGo: (number: number) => void;
}) {
  useLocale();
  const root = useRef<HTMLElement>(null),
    [top, setTop] = useState(0),
    [height, setHeight] = useState(500);
  const row =
      (rotation % 180 ? engine.firstSize.width : engine.firstSize.height) *
        0.2 +
      46,
    count = engine.document?.numPages ?? 0;
  useEffect(() => {
    if (root.current)
      root.current.scrollTop = Math.max(0, (current - 1) * row - height / 2);
  }, [current, rotation]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(() =>
      setHeight(root.current?.clientHeight ?? 500),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const start = Math.max(0, Math.floor(top / row) - 2),
    end = Math.min(count, Math.ceil((top + height) / row) + 2);
  return (
    <aside
      ref={root}
      className="document-sidebar"
      aria-label={tr("PDF thumbnails")}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: count * row, position: "relative" }}>
        {Array.from(
          { length: Math.max(0, end - start) },
          (_, i) => start + i + 1,
        ).map((number) => (
          <button
            key={number}
            aria-pressed={number === current}
            onClick={() => onGo(number)}
            style={{
              position: "absolute",
              top: (number - 1) * row,
              width: "100%",
              border: 0,
              background: "transparent",
              color: "inherit",
              padding: 8,
            }}
          >
            <Page
              engine={engine}
              number={number}
              scale={0.2}
              rotation={rotation}
              thumbnail
              onGo={onGo}
            />
            <span>{number}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
export function PageNavigator({current,count,go,close}:{current:number;count:number;go:(page:number)=>void;close:()=>void}) {
 useLocale();const [draft,setDraft]=useState(String(current)),[error,setError]=useState(false);
 useEffect(()=>{setDraft(String(current));setError(false);},[current]);
 const confirm=()=>{const page=Number(draft);if(!/^\d+$/.test(draft)||!Number.isInteger(page)||page<1||page>count){setError(true);return;}setError(false);go(page);};
 return <div className="pdf-page-navigator"><button disabled={current===1} onClick={()=>go(current-1)}>{tr('Previous')}</button><input type="text" inputMode="numeric" aria-label={tr('Jump to page')} aria-invalid={error} value={draft} onChange={e=>{setDraft(e.target.value);setError(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();confirm();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDraft(String(current));close();}}}/><span>/ {count}</span><button disabled={current===count} onClick={()=>go(current+1)}>{tr('Next')}</button>{error&&<span role="alert">{tr('Enter a page from 1 to {v0}.',{v0:count})}</span>}</div>;
}
export function PdfViewer({
  model: engine,
  context,
  session,
  updateSession,
  activeCapability,
  mode,
}: ViewerRenderProps<PdfEngine>) {
  useLocale();
  useSyncExternalStore(engine.subscribe, engine.snapshot);
  const preferences=useUiSettings();
  const focusWindow=new URLSearchParams(location.search).get('window')==='focus';
  const [utility,setUtility]=useState<'zoom'|'page'|undefined>();
  const zoomTrigger=useRef<HTMLButtonElement>(null),pageTrigger=useRef<HTMLButtonElement>(null);
  const saved = session.metadata;
  const [scale, setScale] = useState(Number(saved.pdfZoom) || 1),
    [fit, setFit] = useState(String(saved.pdfFit || "width")),
    [rotation, setRotation] = useState(Number(saved.pdfRotation) || 0),
    [current, setCurrent] = useState(Number(saved.pdfPage) || 1),
    [panel, setPanel] = useState(String(saved.pdfPanel ?? "thumbnails")),
    [query, setQuery] = useState(String(saved.pdfQuery || "")),
    [sensitive, setSensitive] = useState(typeof saved.pdfCase==='boolean'?saved.pdfCase:preferences.searchCase),
    [whole, setWhole] = useState(typeof saved.pdfWhole==='boolean'?saved.pdfWhole:preferences.searchWhole),
    [hits, setHits] = useState<PdfHit[]>([]),
    [selected, setSelected] = useState(Number(saved.pdfSelected) || 0),
    [progress, setProgress] = useState(0),
    [scroll, setScroll] = useState(0),
    [width, setWidth] = useState(800),
    [height, setHeight] = useState(550),
    [sizes, setSizes] = useState<
      Record<number, { width: number; height: number }>
    >({}),
    [password, setPassword] = useState("");
  const anchor = useRef<{ page: number; fraction: number } | undefined>(
    undefined,
  );
  const root = useRef<HTMLDivElement>(null);
  const dimensionsReady = useRef(false),
    firstQuery = useRef(true);
  const viewport = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    restore = useRef(false);
  const count = engine.document?.numPages ?? 0,
    single = mode === "single";
  const base =
    rotation % 180
      ? { width: engine.firstSize.height, height: engine.firstSize.width }
      : engine.firstSize;
  const effective =
    fit === "width"
      ? Math.max(0.25, Math.min(8, (width - 48) / base.width))
      : fit === "page"
        ? Math.max(
            0.25,
            Math.min(
              8,
              Math.min((width - 48) / base.width, (height - 48) / base.height),
            ),
          )
        : scale;
  useEffect(() => {
    // Report the actual fit scale, not the last requested custom zoom.
    updateSession({metadata:{...session.metadata,pdfPage:current,pdfEffectiveZoom:effective}});
  }, [current, effective]);
  const offsets: number[] = [];
  let total = 24;
  for (let n = 1; n <= count; n++) {
    offsets.push(total);
    total += (sizes[n]?.height ?? base.height) * effective + 24;
  }
  const reading = useRef({ page: current, fraction: 0 });
  reading.current = {
    page: current,
    fraction: Math.max(
      0,
      (scroll - (offsets[current - 1] ?? 0)) /
        ((sizes[current]?.height ?? base.height) * effective),
    ),
  };
  const go = (n: number) => {
    n = Math.max(1, Math.min(count, n));
    const top = offsets[n - 1] ?? 0;
    setCurrent(n);
    setScroll(single ? 0 : top);
    reading.current = {page:n,fraction:0};
    if (viewport.current && !single) viewport.current.scrollTop = top;
    updateSession({ metadata: { ...session.metadata, pdfPage: n, pdfScroll:single?0:top, pdfFraction:0 } });
  };
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      anchor.current = dimensionsReady.current
        ? { ...reading.current }
        : {
            page: Number(saved.pdfPage) || 1,
            fraction: Number(saved.pdfFraction) || 0,
          };
      dimensionsReady.current = true;
      setWidth(node.clientWidth);
      setHeight(node.clientHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, engine.passwordRequired]);
  useEffect(() => {
    if (count && !restore.current && viewport.current) {
      restore.current = true;
      viewport.current.scrollTop =
        Number(saved.pdfScroll) || offsets[current - 1] || 0;
    }
  }, [count]);
  useEffect(() => {
    if (activeCapability === "outline") setPanel("outline");
    if (activeCapability === "search") {
      setPanel("search");
      setTimeout(() => search.current?.focus(), 0);
    }
  }, [activeCapability]);
  const focus = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    if (activeCapability === "fullscreen") focus();
  }, [activeCapability]);
  useEffect(() => {
    updateSession({ metadata: { ...session.metadata, pdfPanel: panel } });
  }, [panel]);
  useEffect(() => {
    if (!count || panel !== 'search') { engine.cancelSearch(); return; }
    setHits([]);
    if (firstQuery.current) firstQuery.current = false;
    else setSelected(0);
    setProgress(0);
    const timer = setTimeout(() => {
      void engine
        .search(query, sensitive, whole, (value, page) => {
          setHits(value);
          setProgress(page);
        })
        .catch(() => {});
    }, 250);
    updateSession({
      metadata: {
        ...session.metadata,
        pdfQuery: query,
        pdfCase: sensitive,
        pdfWhole: whole,
      },
    });
    return () => {
      clearTimeout(timer);
      engine.cancelSearch();
    };
  }, [query, sensitive, whole, engine, count, panel]);
  useEffect(() => {
    updateSession({ metadata: { ...session.metadata, pdfSelected: selected } });
  }, [selected]);
  useLayoutEffect(() => {
    if (anchor.current && viewport.current) {
      const value = anchor.current;
      viewport.current.scrollTop =
        (offsets[value.page - 1] ?? 0) +
        Math.max(0, value.fraction) *
          (sizes[value.page]?.height ?? base.height) *
          effective;
      anchor.current = undefined;
    }
  }, [effective, rotation]);
  const zoom = (next: number, nextFit = "custom") => {
    anchor.current = {
      page: current,
      fraction:
        (scroll - (offsets[current - 1] ?? 0)) /
        ((sizes[current]?.height ?? base.height) * effective),
    };
    setScale(Math.max(0.25, Math.min(8, next)));
    setFit(nextFit);
    updateSession({
      metadata: {
        ...session.metadata,
        pdfZoom: next,
        pdfFit: nextFit,
        pdfRotation: rotation,
        pdfPage: current,
      },
    });
  };
  const rotate = () => {
    const next = (rotation + 90) % 360;
    anchor.current = { page: current, fraction: 0 };
    setSizes({});
    setRotation(next);
    updateSession({ metadata: { ...session.metadata, pdfRotation: next } });
  };
  useEffect(() =>
    context.registerActions?.([
      {
        id: "search",
        get label() { return tr("Search"); },
        disabled: !engine.copyAllowed,
        action: () => setPanel(panel === "search" ? "" : "search"),
      },
      { id: "pdf-rotate", get label() { return tr("Rotate"); }, action: rotate },
      { id: "fullscreen", get label() { return tr("Fullscreen"); }, action: focus },
      {
        id: "pdf-zoom-in",
        get label() { return tr("Zoom in"); },
        shortcut: "Ctrl++",
        action: () => zoom(effective * 1.25),
      },
      {
        id: "pdf-zoom-out",
        get label() { return tr("Zoom out"); },
        shortcut: "Ctrl+-",
        action: () => zoom(effective * 0.8),
      },
      {
        id: "pdf-fit-width",
        get label() { return tr("Fit width"); },
        shortcut: "Ctrl+0",
        action: () => zoom(effective, "width"),
      },
      {
        id: "pdf-thumbnails",
        get label() { return tr("Thumbnails"); },
        action: () => setPanel(panel === "thumbnails" ? "" : "thumbnails"),
      },
      {
        id: "pdf-contents",
        get label() { return tr("Contents"); },
        action: () => setPanel(panel === "outline" ? "" : "outline"),
      },
    ]),
    [context.registerActions, engine, panel, effective, rotation, current, scroll, sizes],
  );
  if (engine.error)
    return (
      <div className="document-message" role="alert">
        <h2>{tr("PDF preview unavailable")}</h2>
        <p>{engine.error}</p>
        <button
          disabled={!engine.context.services.file.openExternal}
          onClick={() => engine.context.services.file.openExternal?.()}
        >
          {tr("Open with system app")}</button>
      </div>
    );
  if (engine.passwordRequired)
    return (
      <form
        className="document-message"
        onSubmit={(e) => {
          e.preventDefault();
          engine.password(password);
          setPassword("");
        }}
      >
        <h2>{tr("Password-protected PDF")}</h2>
        <p>
          {engine.incorrectPassword
            ? tr("Incorrect password. Try again.")
            : tr("Enter the document password to continue.")}
        </p>
        <input
          aria-label={tr("Document password")}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">{tr("Unlock")}</button>
      </form>
    );
  if (!count) return <p className="document-message">{tr("Opening PDF…")}</p>;
  const visible = single
    ? [current]
    : offsets
        .map((top, i) => ({ top, i }))
        .filter(
          ({ top, i }) =>
            top + (sizes[i + 1]?.height ?? base.height) * effective >
              scroll - 900 && top < scroll + 1500,
        )
        .map(({ i }) => i + 1);
  return (
    <div
      className="pdf-viewer"
      data-copy-restricted={!engine.copyAllowed}
      ref={root}
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).matches("input,textarea")) return;
        if (e.ctrlKey && e.key.toLowerCase() === "f") {
          e.preventDefault();
          setPanel("search");
          setTimeout(() => search.current?.focus(), 0);
        } else if (e.ctrlKey && e.key.toLowerCase() === "g") {
          e.preventDefault();
          viewport.current?.parentElement
            ?.querySelector<HTMLInputElement>('[aria-label="Page number"]')
            ?.focus();
        } else if (e.key === "PageDown") {
          e.preventDefault();
          go(current + 1);
        } else if (e.key === "PageUp") {
          e.preventDefault();
          go(current - 1);
        } else if (e.ctrlKey && ["+", "=", "-", "0", "1"].includes(e.key)) {
          e.preventDefault();
          zoom(
            e.key === "-"
              ? effective * 0.8
              : e.key === "0"
                ? 1
                : e.key === "1"
                  ? 1
                  : effective * 1.25,
            e.key === "0" ? "width" : "custom",
          );
        }
      }}
    >
      {(() => { const controls = <div className="document-toolbar">
        <button
          aria-label={tr("Previous page")}
          disabled={current === 1}
          onClick={() => go(current - 1)}
        >
          ‹
        </button>
        <input
          aria-label={tr("Page number")}
          type="number"
          min={1}
          max={count}
          value={current}
          onChange={(e) => go(Number(e.target.value) || 1)}
        />
        <span>/ {count}</span>
        <button
          aria-label={tr("Next page")}
          disabled={current === count}
          onClick={() => go(current + 1)}
        >
          ›
        </button>
        <span>{Math.round(effective * 100)}%</span>
        <select
          aria-label={tr("PDF fit")}
          value={fit}
          onChange={(e) => zoom(effective, e.target.value)}
        >
          <option value="width">{tr("Fit width")}</option>
          <option value="page">{tr("Fit page")}</option>
          <option value="custom">{tr("Custom zoom")}</option>
        </select>
      </div>; const host = focusWindow && document.getElementById('focus-viewer-tools');return host ? createPortal(controls, host) : controls; })()}
      <div className="pdf-utility-triggers"><button ref={zoomTrigger} data-floating-trigger aria-label={tr("Zoom Controls")} onClick={()=>setUtility(v=>v==='zoom'?undefined:'zoom')}>{tr("Zoom")}</button><button ref={pageTrigger} data-floating-trigger aria-label={tr("Page Navigator")} onClick={()=>setUtility(v=>v==='page'?undefined:'page')}>{tr("Pages")}</button></div>
      {utility==='page'&&<FloatingPanel title={tr("Page Navigator")} layoutId="page-navigator" anchorElement={pageTrigger.current} owner={context.source} close={()=>setUtility(undefined)}><PageNavigator current={current} count={count} go={go} close={()=>setUtility(undefined)}/></FloatingPanel>}
      {utility==='zoom'&&<FloatingPanel title={tr("Zoom Controls")} layoutId="zoom-controls" anchorElement={zoomTrigger.current} owner={context.source} close={()=>setUtility(undefined)}><div className="pdf-floating-controls" aria-label={tr("PDF zoom and rotation")}>
        <button aria-label={tr("Zoom out")} onClick={() => zoom(effective * 0.8)}>
          −
        </button>
        <span>{Math.round(effective * 100)}%</span>
        <button aria-label={tr("Zoom in")} onClick={() => zoom(effective * 1.25)}>
          +
        </button>
        <button onClick={rotate}>{tr("Rotate")}</button>
        <button onClick={()=>zoom(effective,'width')}>{tr("Fit to Width")}</button><button onClick={()=>zoom(effective,'page')}>{tr("Fit to Page")}</button><button onClick={()=>zoom(1,'custom')}>{tr("Actual Size")}</button>
      </div></FloatingPanel>}
      {panel === "search" && (
        <FloatingPanel title={tr("Search Panel")} layoutId="search-panel" owner={context.source} close={()=>setPanel('')}><div className="document-search">
          <input
            ref={search}
            aria-label={tr("Search PDF")}
            disabled={!engine.copyAllowed}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(hits.length){const next=(selected+(e.shiftKey?-1:1)+hits.length)%hits.length;setSelected(next);go(hits[next].page);}}}}
            placeholder={tr("Find in document")}
          />
          <label>
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitive(e.target.checked)}
            />
            {tr("Case")}</label>
          <label>
            <input
              type="checkbox"
              checked={whole}
              onChange={(e) => setWhole(e.target.checked)}
            />
            {tr("Whole word")}</label>
          <span>
            {hits.length} {' '}{tr("results ·")}{' '}{progress}/{count} {tr("pages")}</span>
          {[-1, 1].map((delta) => (
            <button
              key={delta}
              disabled={!hits.length}
              aria-label={delta < 0 ? tr("Previous result") : tr("Next result")}
              onClick={() => {
                const next = (selected + delta + hits.length) % hits.length;
                setSelected(next);
                go(hits[next].page);
              }}
            >
              {delta < 0 ? "‹" : "›"}
            </button>
          ))}
          <button onClick={() => setPanel("")}>{tr("Close")}</button>
          {hits[selected] && <span>{hits[selected].excerpt}</span>}
        </div></FloatingPanel>
      )}
      <div className="document-layout">
        {panel === "outline" && (
          <aside className="document-sidebar" aria-label={tr("PDF outline")}>
            {engine.outline.length ? (
              engine.outline.map((item, i) => (
                <button
                  key={i}
                  style={{ paddingLeft: 12 + item.depth * 12 }}
                  onClick={() =>
                    void engine.destination(item.dest).then((n) => n && go(n))
                  }
                >
                  {item.title}
                </button>
              ))
            ) : (
              <p>{tr("No embedded outline")}</p>
            )}
          </aside>
        )}
        {panel === "thumbnails" && !focusWindow && (
          <Thumbnails
            engine={engine}
            current={current}
            rotation={rotation}
            onGo={go}
          />
        )}
        {panel === "thumbnails" && focusWindow && <FloatingPanel title={tr("Thumbnail Strip")} layoutId="thumbnail-strip" owner={context.source} close={()=>setPanel('')} width={220}><Thumbnails engine={engine} current={current} rotation={rotation} onGo={go}/></FloatingPanel>}
        <div
          ref={viewport}
          className="pdf-viewport"
          aria-label={tr("PDF pages")}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop;
            setScroll(top);
            let page = current;
            if (!single) {
              const index = offsets.findIndex(
                (offset, i) =>
                  offset + (sizes[i + 1]?.height ?? base.height) * effective >
                  top + 60,
              );
              page = index < 0 ? count : index + 1;
              setCurrent(page);
            }
            updateSession({
              metadata: {
                ...session.metadata,
                pdfPage: page,
                pdfScroll: top,
                pdfFraction: Math.max(
                  0,
                  (top - (offsets[page - 1] ?? 0)) /
                    ((sizes[page]?.height ?? base.height) * effective),
                ),
              },
            });
          }}
        >
          <div
            className="pdf-stack"
            style={{
              height: single
                ? (sizes[current]?.height ?? base.height) * effective + 48
                : total,
              minWidth: base.width * effective + 48,
            }}
          >
            {visible.map((n) => (
              <div
                key={n}
                data-page={n}
                style={{
                  position: "absolute",
                  top: single ? 24 : offsets[n - 1],
                  left: "50%",
                  transform: "translateX(-50%)",
                  minHeight: (sizes[n]?.height ?? base.height) * effective,
                }}
              >
                <Page
                  engine={engine}
                  number={n}
                  scale={effective}
                  rotation={rotation}
                  onGo={go}
                  hit={hits[selected]?.page === n ? hits[selected] : undefined}
                  onSize={(w, h) =>
                    setSizes((old) =>
                      old[n]?.height === h / effective
                        ? old
                        : {
                            ...old,
                            [n]: {
                              width: w / effective,
                              height: h / effective,
                            },
                          },
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {!engine.copyAllowed && (
        <p className="document-notice">
          {tr("This PDF restricts text copying and searching.")}</p>
      )}
    </div>
  );
}
export function PdfInspector({ model, session }: ViewerRenderProps<PdfEngine>) {
  useLocale();
  useSyncExternalStore(model.subscribe, model.snapshot);
  const number = Number(session.metadata.pdfPage) || 1,
    detail = model.pageDetails.get(number);
  return (
    <div className="document-inspector">
      <h3>{tr("PDF document")}</h3>
      <dl>
        <dt>{tr("Pages")}</dt>
        <dd>{model.document?.numPages ?? tr("Loading")}</dd>
        <dt>{tr("Encryption")}</dt>
        <dd>
          {model.encrypted
            ? tr("Encrypted")
            : model.metadata.IsAcroFormPresent === "true"
              ? tr("Forms present")
              : tr("Not reported")}
        </dd>
        <dt>{tr("Page 1 size")}</dt>
        <dd>
          {Math.round((model.firstSize.width * 25.4) / 72)} ×{" "}
          {Math.round((model.firstSize.height * 25.4) / 72)} {tr("mm")}</dd>
        {detail && (
          <>
            <dt>{tr("Current page")}</dt>
            <dd>{number}</dd>
            <dt>{tr("Page size")}</dt>
            <dd>
              {Math.round((detail.width * 25.4) / 72)} ×{" "}
              {Math.round((detail.height * 25.4) / 72)} {tr("mm")}</dd>
            <dt>{tr("Rotation")}</dt>
            <dd>{detail.rotation}°</dd>
            <dt>{tr("Text items")}</dt>
            <dd>{model.copyAllowed ? detail.textItems : tr("Restricted")}</dd>
            <dt>{tr("Image drawing operations")}</dt>
            <dd>{detail.images ?? tr("Unavailable")}</dd>
          </>
        )}
        {Object.entries(model.metadata).map(([key, value]) => (
          <div key={key}>
            <dt>{tr(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h4>{tr("Attachments")}</h4>
      {model.attachments.length ? (
        model.attachments.map((name, i) => (
          <p key={i}>{name} {' '}{tr("· preview unavailable")}</p>
        ))
      ) : (
        <p>{tr("No embedded attachments reported")}</p>
      )}
      <p>
        {tr("Forms and annotations are read-only. JavaScript, launch actions and XFA are disabled.")}</p>
      {model.diagnostics.map((message) => (
        <p key={message}>{tr(message)}</p>
      ))}
    </div>
  );
}
