import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useUiSettings } from "../../../platform/ui-settings";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import { TEXT_CONFIG } from "./text-config";
import { useTextModel, type TextDocumentModel } from "./text-model";
import { TextLine } from "./TextLine";
import type { SearchOptions, TextLineData, TextMatch } from "./text-engine";
import { useBinaryActivity as useSourceActivity } from '../hex/activity';
import { sourcePosition } from './source-position';
import type { ConfigNode } from './source-analysis';
const languages=['plaintext','javascript','typescript','jsx','tsx','python','rust','go','java','kotlin','c','cpp','csharp','objectivec','matlab','perl','prolog','ruby','php','swift','css','scss','less','xml','bash','powershell','dos','lua','r','dart','scala','dockerfile','makefile','cmake','properties','ini','yaml','json','jsonc'];
function ConfigBranch({node,jump}:{node:ConfigNode;jump:(line:number)=>void}){
  useLocale();const [open,setOpen]=useState(false);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary><button onClick={()=>jump(node.line)}>{node.name} · {node.kind} · {node.line}:{node.column}</button></summary>{open && node.children?.map((child,i)=><ConfigBranch key={i} node={child} jump={jump}/>)}</details>;}
export function TextViewer({
  model,
  session,
  updateSession,
  activeCapability,
  context,
}: ViewerRenderProps<TextDocumentModel>) {
  useLocale();
  useTextModel(model);
  const active=useSourceActivity(context.active ?? true);
  useEffect(()=>{model.setActive(active);return()=>model.setActive(false);},[model,active]);
  const preferences=useUiSettings();
  const metadata = session.metadata,
    wrap =
      typeof metadata.wrap === "boolean"
        ? metadata.wrap
        : preferences.textWrap && model.profile !== "Log",
    numbers =
      typeof metadata.textNumbers === "boolean"
        ? metadata.textNumbers
        : preferences.textNumbers;
  const patch = (data: Record<string, unknown>) =>
    updateSession({ metadata: { ...session.metadata, ...data } });
  const fontSize=[12,13,14,16,18,20,24].includes(Number(metadata.sourceFont))?Number(metadata.sourceFont):preferences.textFontSize;
  const rowHeight=Math.max(TEXT_CONFIG.rowHeight,Math.ceil(fontSize*preferences.textLineHeight));
  const selected = metadata.textSelected as TextLineData | undefined;
  const selectionEnd=metadata.textSelectionEnd as TextLineData | undefined;
  const tabWidth=[2,4,8].includes(Number(metadata.textTabWidth))?Number(metadata.textTabWidth):preferences.textTabSize;
  const column=Number(metadata.textColumn)||0;
  const position=selected?sourcePosition(selected.text,column,selected.offset,model.encoding,tabWidth,model.stats.malformed):undefined;
  const focus=metadata.sourceFocus===true;
  const [scroll, setScroll] = useState(Number(metadata.textScroll) || 0),
    [height, setHeight] = useState(600),
    [width, setWidth] = useState(900),
    [measureVersion, setMeasureVersion] = useState(0);
  const [lines, setLines] = useState(model.preview),
    [message, setMessage] = useState(""),
    [goOpen, setGoOpen] = useState(false),
    [goValue, setGoValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false),
    [options, setOptions] = useState<SearchOptions>({
      query: "",
      caseSensitive: preferences.searchCase,
      wholeWord: preferences.searchWhole,
      regex: false,
    });
  const [matches, setMatches] = useState<TextMatch[]>([]),
    [matchIndex, setMatchIndex] = useState(-1),
    [count, setCount] = useState(0),
    [busy, setBusy] = useState(false),
    [searchLimited, setSearchLimited] = useState(false);
  const [pageLine, setPageLine] = useState<TextLineData>(),
    [pageNumber, setPageNumber] = useState(0),
    [pageText, setPageText] = useState("");
  const ref = useRef<HTMLDivElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    searchTask = useRef<AbortController>(undefined);
  const navigationTask=useRef<AbortController>(undefined);
  useEffect(()=>()=>navigationTask.current?.abort(),[model]);
  const measured = useRef(new Map<number, number>());
  const totalLines = Math.max(model.stats.lines, model.preview.length);
  const lineTop = (line: number) => {
    let top = (line - 1) * rowHeight;
    measured.current.forEach((extra, number) => {
      if (number < line) top += extra;
    });
    return top;
  };
  const totalHeight = Math.max(height, lineTop(totalLines + 1)),
    spacer = Math.min(totalHeight, TEXT_CONFIG.maxScrollPixels);
  const scale =
    totalHeight > height ? (spacer - height) / (totalHeight - height) : 1;
  let lower = 1,
    upper = totalLines;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (lineTop(middle) * scale <= scroll) lower = middle;
    else upper = middle - 1;
  }
  const anchor = lower,
    first = Math.max(1, anchor - TEXT_CONFIG.overscan),
    rows = Math.min(96, Math.ceil(height / rowHeight) + TEXT_CONFIG.overscan * 2);
  const firstTop =
    scale === 1 ? lineTop(first) : scroll - (lineTop(anchor) - lineTop(first));
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = scroll;
  }, []);
  useEffect(() => {
    if(!active)return;
    measured.current.clear();
    setMeasureVersion((value) => value + 1);
  }, [wrap, width, active, rowHeight]);
  useEffect(() => {
    if (!active || !ref.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setHeight(Math.min(window.innerHeight || 1080, entry.contentRect.height || 600));
      setWidth(entry.contentRect.width || 900);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [active]);
  useLayoutEffect(() => {
    if (!active || !wrap || !ref.current) return;
    let changed = false;
    ref.current.querySelectorAll<HTMLElement>(".text-row").forEach((row) => {
      const number = Number(row.dataset.line),
        extra = Math.max(
          0,
          row.offsetHeight - rowHeight,
        );
      if (extra !== (measured.current.get(number) ?? 0)) {
        measured.current.set(number, extra);
        changed = true;
      }
    });
    // Bounded layout history prevents a per-line metadata allocation for huge files.
    while (measured.current.size > 2048)
      measured.current.delete(measured.current.keys().next().value!);
    if (changed) setMeasureVersion((value) => value + 1);
  }, [lines, wrap, width, active, rowHeight]);
  useEffect(() => {
    if(!active)return;
    const task = new AbortController();
    void model
      .lines(first, rows, task.signal)
      .then((value) => {
        if (!task.signal.aborted) setLines(value);
      })
      .catch((error) => {
        if (!task.signal.aborted) setMessage(error.message);
      });
    return () => task.abort();
  }, [model, first, rows, model.status, active]);
  const jump = (line: number) => {
    if (line < 1 || line > totalLines || !Number.isInteger(line)) {
      setMessage(
        tr("Enter a line from 1 to {v0}{v1}.", { v0: formatNumber(totalLines), v1: model.status === "complete" ? "" : tr(" (indexing continues)") }),
      );
      return;
    }
    const top = Math.min(lineTop(line) * scale, spacer - height);
    if (ref.current) ref.current.scrollTop = top;
    setScroll(top);
    patch({ textScroll: top });
    setMessage("");
  };
  const locate=(line:number,column=1)=>{jump(line);navigationTask.current?.abort();const task=navigationTask.current=new AbortController();void model.lines(line,1,task.signal).then(rows=>{if(!task.signal.aborted && rows[0])patch({textSelected:rows[0],textColumn:column-1,textSelectionEnd:undefined});}).catch(error=>{if(!task.signal.aborted)setMessage(error.message);});};
  useEffect(()=>{const pending=session.metadata.productivityMatch as TextMatch|undefined;if(pending){jump(pending.line);setMatches([pending]);setMatchIndex(0);delete session.metadata.productivityMatch;}const navigate=(event:Event)=>{const {source,hit}=(event as CustomEvent).detail;if(source!==model.context.source)return;jump(hit.line);setMatches([hit]);setMatchIndex(0);};window.addEventListener('elorin-navigate-search',navigate);return()=>window.removeEventListener('elorin-navigate-search',navigate);},[model,session.metadata.productivityMatch,totalLines]);
  useEffect(() => {
    setSearchOpen(activeCapability === "search");
  }, [activeCapability]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if(!active || ref.current?.closest('[hidden]'))return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        setGoOpen(true);
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [active]);
  useEffect(() => {
    setMatches([]);
    setCount(0);
    setMatchIndex(-1);
    setSearchLimited(false);
    if (!active || !searchOpen || !options.query) {
      setBusy(false);
      return;
    }
    const task = new AbortController();
    searchTask.current = task;
    setBusy(true);
    setMessage("");
    const timer = setTimeout(() => {
      void model
        .search(options, task.signal, (batch) => {
          if (task.signal.aborted) return;
          setCount(batch.count);
          setSearchLimited(batch.limited);
          setMatches((previous) => [...previous, ...batch.matches]);
        })
        .catch((error) => {
          if (!task.signal.aborted) setMessage(error.message);
        })
        .finally(() => {
          if (!task.signal.aborted) setBusy(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      task.abort();
    };
  }, [options, searchOpen, model, active]);
  useEffect(() => {
    if (matchIndex === -1 && matches.length) {
      setMatchIndex(0);
      jump(matches[0].line);
    }
  }, [matches]);
  const navigate = (direction: number) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    jump(matches[next].line);
    patch({ textSelected: undefined });
  };
  useEffect(() => {
    if (!active || !pageLine) return;
    let current = true;
    setPageText("");
    void model
      .linePage(pageLine, pageNumber)
      .then((text) => {
        if (current) setPageText(text);
      })
      .catch((error) => {
        if (current) setMessage(error.message);
      });
    return () => {
      current = false;
    };
  }, [pageLine, pageNumber, model, active]);
  const match = matches[matchIndex];
  return (
    <div className="text-viewer" data-profile={model.profile}>
      <div className="text-options">
        <span>
          {model.profile}
          {model.language ? tr(" · {v0}", { v0: model.language }) : ""}
        </span>
        <label>{tr("Language")}<select aria-label={tr("Source language")} value={model.language ?? 'plaintext'} onChange={e=>model.setLanguage(e.target.value)}>{languages.map(l=><option key={l}>{l}</option>)}</select></label>
        <label>{tr("Tabs")}<select aria-label={tr("Tab width")} value={tabWidth} onChange={e=>patch({textTabWidth:Number(e.target.value)})}>{[2,4,8].map(n=><option key={n}>{n}</option>)}</select></label>
        <label>{tr("Font")}<select aria-label={tr("Source font size")} value={Number(metadata.sourceFont)||preferences.textFontSize} onChange={e=>patch({sourceFont:Number(e.target.value)})}>{[12,13,14,16,18,20,24].map(n=><option key={n}>{n}</option>)}</select></label>
        <button aria-pressed={focus} onClick={()=>patch({sourceFocus:!focus})}>{tr("Focus source")}</button>
        <label>
          <input
            type="checkbox"
            checked={wrap}
            onChange={(event) => patch({ wrap: event.target.checked })}
          />
          {tr("Wrap lines")}</label>
        <label>
          <input
            type="checkbox"
            checked={numbers}
            onChange={(event) => patch({ textNumbers: event.target.checked })}
          />
          {tr("Line numbers")}</label>
        <button onClick={() => setGoOpen((value) => !value)}>{tr("Go to line")}</button>
        {model.profile === "Log" && (
          <button onClick={() => jump(totalLines)}>{tr("Open at end")}</button>
        )}
        {selected && (
          <>
            {selectionEnd && <button onClick={()=>{void model.copyLines(selected,selectionEnd).then(()=>setMessage(tr("Selected lines copied."))).catch(error=>setMessage(error.message));}}>{tr("Copy selected lines")}</button>}
            <button
              onClick={() => {
                void model
                  .copyLine(selected)
                  .then(() => setMessage(tr("Line copied.")))
                  .catch((error) => setMessage(error.message));
              }}
            >
              {tr("Copy line")}</button>
            <button onClick={() => patch({ textSelected: undefined })}>
              {tr("File details")}</button>
          </>
        )}
      </div>
      {!focus && model.language && <details className="source-structure"><summary>{tr("Structure / analysis")}</summary><p role="status">{model.analysisStatus}</p>{model.analysis?.symbols.map((symbol,i)=><button key={i} onClick={()=>locate(symbol.line,symbol.column)}>{symbol.kind} · {symbol.name} · {symbol.line}:{symbol.column}–{symbol.endLine}:{symbol.endColumn}</button>)}{model.analysis?.config && <ConfigBranch node={model.analysis.config} jump={locate}/>}</details>}
      {model.sizeClass === "Large" || model.sizeClass === "Very Large" ? (
        <p className="text-notice">
          {tr("Large Text Mode ·")}{" "}
          {model.sizeClass === "Very Large"
            ? tr("Syntax highlighting disabled")
            : tr("Reduced highlighting")}{" "}
          {tr("· Search available")}</p>
      ) : null}
      {model.status === "indexing" && (
        <div className="text-progress" role="status">
          {tr("Indexing…")}{" "}
          {model.size
            ? Math.floor((model.stats.processed / model.size) * 100)
            : 100}
          % <button onClick={() => model.cancelIndex()}>{tr("Cancel indexing")}</button>
        </div>
      )}
      {model.status === "cancelled" && (
        <p>
          {tr("Indexing paused or limited. The indexed prefix remains available; search still scans the full file.")}{model.diagnostics.join(' ')}
        </p>
      )}
      {model.status === "error" && (
        <p role="alert">{model.diagnostics.join(" ")}</p>
      )}
      {searchOpen && (
        <div className="text-search" role="search">
          <input
            ref={searchRef}
            aria-label={tr("Search text")}
            placeholder={tr("Search text")}
            value={options.query}
            onChange={(event) =>
              setOptions({ ...options, query: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                navigate(event.shiftKey ? -1 : 1);
              }
              if (event.key === "Escape") setSearchOpen(false);
            }}
          />
          {(
            [
              ["caseSensitive", "Aa"],
              ["wholeWord", "Word"],
              ["regex", ".*"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-label={
                key === "caseSensitive"
                  ? tr("Case sensitive")
                  : key === "wholeWord"
                    ? tr("Whole word")
                    : tr("Regex")
              }
              aria-pressed={options[key]}
              onClick={() => setOptions({ ...options, [key]: !options[key] })}
            >
              {label}
            </button>
          ))}
          <span aria-live="polite">
            {formatNumber(count)} {' '}{tr("matches")}{busy ? tr("· Searching…") : ""}
            {count > TEXT_CONFIG.searchResults
              ? tr(" · Navigate first {v0}", { v0: TEXT_CONFIG.searchResults })
              : ""}
          </span>
          <button
            aria-label={tr("Previous match")}
            disabled={!matches.length}
            onClick={() => navigate(-1)}
          >
            ↑
          </button>
          <button
            aria-label={tr("Next match")}
            disabled={!matches.length}
            onClick={() => navigate(1)}
          >
            ↓
          </button>
          {busy && (
            <button
              onClick={() => {
                searchTask.current?.abort();
                setBusy(false);
              }}
            >
              {tr("Cancel search")}</button>
          )}
          <button
            aria-label={tr("Close search")}
            onClick={() => setSearchOpen(false)}
          >
            ×
          </button>
          {options.regex && (
            <small>
              {tr("Regex scans each line, up to 64 KiB; background timeout enabled.")}</small>
          )}
          {searchLimited && (
            <small>
              {tr("Very long lines skipped by regex. Use literal search to scan all text.")}</small>
          )}
        </div>
      )}
      {goOpen && (
        <form
          className="text-go"
          onSubmit={(event) => {
            event.preventDefault();
            jump(Number(goValue));
            setGoOpen(false);
          }}
        >
          <input
            autoFocus
            aria-label={tr("Line number")}
            inputMode="numeric"
            value={goValue}
            onChange={(event) => setGoValue(event.target.value)}
          />
          <button type="submit">{tr("Go")}</button>
          <button type="button" onClick={() => setGoOpen(false)}>
            {tr("Close")}</button>
        </form>
      )}
      {message && (
        <p className="text-notice" role="status">
          {message}
        </p>
      )}
      {pageLine && (
        <section className="text-line-page" aria-label={tr("Long line preview")}>
          <div>
            {tr("Line")}{pageLine.number} ·{" "}
            {formatNumber((pageLine.end - pageLine.offset))} {' '}{tr("bytes · Page")}{" "}
            {pageNumber + 1}
            <button
              disabled={!pageNumber}
              onClick={() => setPageNumber((value) => value - 1)}
            >
              {tr("Previous page")}</button>
            <button
              disabled={
                (pageNumber + 1) * TEXT_CONFIG.linePageBytes >=
                pageLine.end - pageLine.offset
              }
              onClick={() => setPageNumber((value) => value + 1)}
            >
              {tr("Next page")}</button>
            <button onClick={() => setPageLine(undefined)}>
              {tr("Close preview")}</button>
          </div>
          <pre>{pageText}</pre>
        </section>
      )}
      <div
        ref={ref}
        className={`text-viewport ${wrap ? "wrap-lines" : ""}`}
        aria-label={tr("Read-only text")}
        tabIndex={0}
        data-layout-version={measureVersion}
        style={{tabSize:tabWidth,fontSize,lineHeight:rowHeight+"px"}}
        onKeyDown={event=>{if(!selected)return;const line=event.key==='ArrowUp'?selected.number-1:event.key==='ArrowDown'?selected.number+1:event.key==='Home'?1:event.key==='End'?totalLines:undefined;if(line!==undefined){event.preventDefault();jump(line);const found=lines.find(l=>l.number===line);if(found)patch({textSelected:found,textColumn:0});}}}
        onScroll={(event) => {
          setScroll(event.currentTarget.scrollTop);
          patch({ textScroll: event.currentTarget.scrollTop });
        }}
      >
        <div className="text-spacer" style={{ height: spacer }}>
          <div className="text-visible" role="list" style={{ top: firstTop }}>
            {lines
              .filter((line) => line.number >= first)
              .map((line) => (
                <div
                  key={line.number}
                  role="listitem"
                  aria-current={
                    selected?.number === line.number ? "true" : undefined
                  }
                  data-line={line.number}
                  className={`text-row ${selected && line.number>=Math.min(selected.number,selectionEnd?.number ?? selected.number) && line.number<=Math.max(selected.number,selectionEnd?.number ?? selected.number) ? "current" : ""}`}
                  onClick={(event) => {if(event.shiftKey && selected){patch({textSelectionEnd:line});return;}const selection=window.getSelection();let col=0;if(selection?.anchorNode && event.currentTarget.querySelector('.text-line-source')?.contains(selection.anchorNode)){const range=document.createRange();range.selectNodeContents(event.currentTarget.querySelector('.text-line-source')!);range.setEnd(selection.anchorNode,selection.anchorOffset);col=range.toString().length;}patch({ textSelected: line,textColumn:col,textSelectionEnd:undefined });}}
                >
                  {numbers && (
                    <span className="text-gutter" aria-hidden="true">
                      {line.number}
                    </span>
                  )}
                  <div className="text-line-content">
                    <span className="text-line-source">
                      <TextLine
                        text={line.text}
                        profile={model.profile}
                        language={model.language}
                        highlighting={
                          model.sizeClass !== "Very Large" &&
                          (model.sizeClass !== "Large" ||
                            line.text.length < 512)
                        }
                        tokens={active && !line.truncated ? model.analysis?.tokens[line.number-1] : undefined}
                        match={match?.line === line.number ? match : undefined}
                      />
                    </span>
                    {line.truncated && (
                      <button
                        className="text-long-line"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPageLine(line);
                          setPageNumber(0);
                        }}
                      >
                        {tr("Very long line ·")}{line.endUnknown ? tr("at least") : ""}
                        {formatNumber((line.end - line.offset))} {tr("bytes · View pages")}</button>
                    )}
                  </div>
                </div>
              ))}
            {!model.size && <span className="text-empty">{tr("(Empty file)")}</span>}
          </div>
        </div>
      </div>
      <div className="text-status">
        {formatNumber(model.stats.lines)} {tr("lines")}{model.status !== "complete" ? "+" : ""} · {model.encoding} ·{" "}
        {model.lineEndings} {tr("· Read only")}{selected && position && tr(" · Line {v0} · UTF-16 {v1} · Code point {v2} · Visual {v3} · Byte {v4}", { v0: selected.number, v1: position.utf16, v2: position.codePoint, v3: position.visual, v4: position.byte ?? tr('unavailable') })}
      </div>
    </div>
  );
}

