import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import { CSV_CONFIG } from "./csv-config";
import { useCsvModel, type TabularDocumentModel } from "./csv-model";
import { CsvGrid } from "./CsvGrid";
import { copyRow, projectRows, searchRows } from "./csv-query";
import { typedValue } from "./csv-stats";
import { registerSearchProvider } from '../../../search/providers';
import { FloatingPanel } from '../../../components/common/FloatingPanel';
import { columnName } from '../../components/ContextualStatus';
import type {
  CsvFilter,
  CsvFilterOp,
  CsvMatch,
  CsvSelection,
  CsvSort,
} from "./csv-types";
function CsvSource({
  model,
  scroll,
  save,
}: {
  model: TabularDocumentModel;
  scroll: number;
  save: (value: number) => void;
}) {
  useLocale();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = scroll;
  }, []);
  return (
    <div
      ref={ref}
      className="csv-source"
      aria-label={tr("CSV source")}
      onScroll={(e) => save(e.currentTarget.scrollTop)}
    >
      {model.sourceTruncated && (
        <p>
          {tr("Previewing part of file · first")}{" "}
          {formatNumber(CSV_CONFIG.sourceChars)} {tr("decoded characters at most.")}</p>
      )}
      <pre aria-label={tr("Read-only CSV source")}>{model.preview}</pre>
    </div>
  );
}
export function CsvViewer(props: ViewerRenderProps<TabularDocumentModel>) {
  useLocale();
  const { model, session, updateSession, context } = props;
  useCsvModel(model);
  const metadata = session.metadata,
    header =
      typeof metadata.csvHeader === "boolean"
        ? metadata.csvHeader
        : model.dialect.detectedHeader,
    mode = props.mode ?? "table";
  const selection = (metadata.csvSelection as CsvSelection) ?? { kind: "none" },
    widths = (metadata.csvWidths as Record<string, number>) ?? {};
  const [navigation, setNavigation] = useState(0),
    [message, setMessage] = useState(""),
    [cellPreview, setCellPreview] = useState(false),
    [filterOpen, setFilterOpen] = useState(false),
    [query, setQuery] = useState(""),
    [scope, setScope] = useState("all"),
    [matches, setMatches] = useState<CsvMatch[]>([]),
    [matchIndex, setMatchIndex] = useState(-1),
    [searchBusy, setSearchBusy] = useState(false),
    [searchLimited, setSearchLimited] = useState(false);
  const [column, setColumn] = useState(0),
    [op, setOp] = useState<CsvFilterOp>("contains"),
    [value, setValue] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const [columnsOpen,setColumnsOpen]=useState(false);
  const hiddenColumns=Array.isArray(metadata.csvHiddenColumns)?(metadata.csvHiddenColumns as number[]).filter(i=>Number.isInteger(i)&&i>=0&&i<model.columns.length):[];
  useEffect(() => {
    if (cellPreview) previewRef.current?.focus();
  }, [cellPreview]);
  const filter = metadata.csvFilter as CsvFilter | undefined,
    sort = metadata.csvSort as CsvSort | undefined;
  const [projection, setProjection] = useState<{
      rows: number[];
      version: number;
      filter: unknown;
      sort: unknown;
      header: boolean;
    }>(),
    [projectBusy, setProjectBusy] = useState(false);
  function patch(data: Record<string, unknown>) {
    updateSession({ metadata: { ...session.metadata, ...data } });
  }
  function select(s: CsvSelection) {
    if (s.kind === "cell") s = { ...s, parsedValue: typedValue(s.rawValue) };
    patch({ csvSelection: s });
    setNavigation((n) => n + 1);
  }
  const selectedColumn =
    selection.kind === "cell" || selection.kind === "column"
      ? selection.column
      : column;
  const searchColumn = scope === "current" ? selectedColumn : undefined;
  useEffect(() => {
    if (!filter && !sort) {
      setProjection(undefined);
      setProjectBusy(false);
      return;
    }
    const aborter = new AbortController();
    const onAbort = () => aborter.abort();
    context.signal.addEventListener("abort", onAbort, { once: true });
    setProjectBusy(true);
    void projectRows(
      model.rowSource,
      header ? 1 : 0,
      filter,
      sort,
      model.columns[sort?.column ?? 0]?.type ?? "String",
      aborter.signal,
    ).then(
      (rows) => {
        if (!aborter.signal.aborted) {
          setProjection({ rows, version: model.version, filter, sort, header });
          setProjectBusy(false);
        }
      },
      (e) => {
        if (!aborter.signal.aborted) {
          setMessage(e.message);
          setProjectBusy(false);
        }
      },
    );
    return () => {
      aborter.abort();
      context.signal.removeEventListener("abort", onAbort);
    };
  }, [filter, sort, header, model.version, model, context.signal]);
  useEffect(() => {
    if (props.activeCapability !== "search" || !query) {
      setMatches([]);
      setSearchBusy(false);
      setSearchLimited(false);
      setMatchIndex(-1);
      return;
    }
    const aborter = new AbortController(),
      onAbort = () => aborter.abort();
    context.signal.addEventListener("abort", onAbort, { once: true });
    setSearchBusy(true);
    const timer = setTimeout(() => {
      void searchRows(
        model.rowSource,
        header ? 1 : 0,
        query,
        searchColumn,
        aborter.signal,
      ).then(
        (result) => {
          if (!aborter.signal.aborted) {
            setMatches(result.results);
            setMatchIndex(-1);
            setSearchLimited(result.limited);
            setSearchBusy(false);
          }
        },
        () => {
          if (!aborter.signal.aborted) setSearchBusy(false);
        },
      );
    }, 200);
    return () => {
      clearTimeout(timer);
      aborter.abort();
      context.signal.removeEventListener("abort", onAbort);
    };
  }, [
    query,
    scope,
    searchColumn,
    props.activeCapability,
    model.version,
    header,
    model,
    context.signal,
  ]);
  const activeRows =
    projection &&
    projection.filter === filter &&
    projection.sort === sort &&
    projection.header === header
      ? projection.rows
      : undefined;
  function jump(index: number) {
    const target = matches[index];
    if (!target) return;
    setMatchIndex(index);
    const rawValue = model.rowSource.get(target.row)?.[target.column] ?? "";
    patch({
      csvFilter: undefined,
      csvSelection: {
        kind: "cell",
        row: target.row,
        column: target.column,
        columnId: `col:${target.column}`,
        rawValue,
        parsedValue: typedValue(rawValue),
      },
    });
    setNavigation((n) => n + 1);
    if (mode === "source") updateSession({ mode: "table" });
  }
  async function copy() {
    try {
      let text = "";
      if (selection.kind === "cell") text = selection.rawValue;
      else if (selection.kind === "row")
        text = copyRow(
          model.rowSource.get(selection.row) ?? [],
          model.dialect.delimiter,
          model.dialect.newline,
        );
      else return;
      if (text.length > CSV_CONFIG.copyChars)
        throw new Error("Copy is limited to 1 Mi-character selections.");
      await navigator.clipboard.writeText(text);
      setMessage(tr("Copied"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : tr("Clipboard unavailable"));
    }
  }
  useEffect(()=>registerSearchProvider(context.source,{get label() { return tr("CSV cells"); },async search(query,signal){const r=await searchRows(model.rowSource,0,query,undefined,signal);return{limited:r.limited,hits:r.results.map(m=>({line:m.row+1,row:m.row,column:m.column,length:query.length,context:model.rowSource.get(m.row)?.[m.column]??''}))};},navigateTo(hit){if(hit.row===undefined)return;const rawValue=model.rowSource.get(hit.row)?.[hit.column]??'';updateSession({mode:'table',metadata:{...session.metadata,csvFilter:undefined,csvSelection:{kind:'cell',row:hit.row,column:hit.column,columnId:`col:${hit.column}`,rawValue,parsedValue:typedValue(rawValue)}}});setNavigation(n=>n+1);}}),[model,context.source,session]);
  const scrollKey = `csv-${mode}-table`,
    saved = (metadata[scrollKey] as { top: number; left: number }) ?? {
      top: 0,
      left: 0,
    };
  return (
    <section className="csv-viewer" aria-label={tr("CSV viewer")}>
      <div className="csv-toolbar">
        <span>
          {formatNumber(Math.max(
            0,
            model.rowSource.count - (header ? 1 : 0),
          ))}
          {model.status === "complete" ? "" : "+"} {' '}{tr("rows ·")}{' '}{model.columns.length}{" "}
          {tr("columns")}</span>
        <label>
          <input
            type="checkbox"
            checked={header}
            onChange={(e) => {
              model.headerOverride = e.target.checked;
              model.refreshStats(e.target.checked);
              patch({
                csvHeader: e.target.checked,
                csvSelection: { kind: "none" },
              });
            }}
          />{" "}
          {tr("First row is header")}</label>
        <button
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((v) => !v)}
        >
          {tr("Filter")}</button>
        <button data-floating-trigger aria-expanded={columnsOpen} onClick={()=>setColumnsOpen(v=>!v)}>{tr("Columns")}</button>
        <button
          disabled={
            model.status === "indexing" ||
            model.rowSource.count > CSV_CONFIG.sortRows
          }
          title={tr("Sort supports up to 50,000 loaded rows after indexing")}
          onClick={() =>
            patch({ csvSort: { column: selectedColumn, direction: "asc" } })
          }
        >
          {tr("Sort ascending")}</button>
        <button
          disabled={
            model.status === "indexing" ||
            model.rowSource.count > CSV_CONFIG.sortRows
          }
          onClick={() =>
            patch({ csvSort: { column: selectedColumn, direction: "desc" } })
          }
        >
          {tr("Sort descending")}</button>
        {(filter || sort) && (
          <button
            onClick={() => patch({ csvFilter: undefined, csvSort: undefined })}
          >
            {tr("Clear view")}</button>
        )}
        {(selection.kind === "cell" || selection.kind === "row") && (
          <button onClick={() => void copy()}>
            {selection.kind === "cell" ? tr("Copy value") : tr("Copy row")}
          </button>
        )}
        <button onClick={() => patch({ csvSelection: { kind: "none" } })}>
          {tr("Dataset")}</button>
      </div>
      {columnsOpen&&<FloatingPanel title={tr("Visible Columns")} owner={context.source} close={()=>setColumnsOpen(false)}><div className="csv-column-chooser">{model.columns.slice(0,1000).map((c,i)=><label key={c.id}><input type="checkbox" checked={!hiddenColumns.includes(i)} disabled={!hiddenColumns.includes(i)&&hiddenColumns.length===model.columns.length-1} onChange={e=>patch({csvHiddenColumns:e.target.checked?hiddenColumns.filter(n=>n!==i):[...hiddenColumns,i]})}/>{columnName(i)} · {c.name}</label>)}{model.columns.length>1000&&<small>{tr("Showing first 1,000 columns.")}</small>}</div></FloatingPanel>}
      <div className="csv-formula-bar" aria-label={tr("Selected cell value")}><span>{selection.kind==='cell'?tr("{v0}{v1}", { v0: columnName(selection.column), v1: selection.row+1 }):'—'}</span><i>ƒx</i><input aria-label={tr("Cell value")} readOnly value={selection.kind==='cell'?selection.rawValue.slice(0,CSV_CONFIG.inspectPreview):''} placeholder={tr("Select a cell to inspect its value")}/></div>
      {props.activeCapability === "search" && (
        <div className="csv-surface" aria-label={tr("CSV search")}>
          <input
            aria-label={tr("Search CSV")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search loaded data…")}
          />
          <select
            aria-label={tr("Search columns")}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">{tr("All columns")}</option>
            <option value="current">{tr("Current column")}</option>
          </select>
          <span role="status">
            {searchBusy
              ? tr("Searching…")
              : tr("{v0}{v1} matches{v2}", { v0: matches.length, v1: searchLimited ? "+" : "", v2: searchLimited ? " · capped at 500" : "" })}
          </span>
          <button
            disabled={!matches.length || searchBusy}
            onClick={() =>
              jump((matchIndex - 1 + matches.length) % matches.length)
            }
          >
            {tr("Previous")}</button>
          <button
            disabled={!matches.length || searchBusy}
            onClick={() => jump((matchIndex + 1) % matches.length)}
          >
            {tr("Next")}</button>
          <small>{tr("Loaded rows · first 32,768 characters per value")}</small>
        </div>
      )}
      {filterOpen && (
        <form
          className="csv-surface"
          aria-label={tr("CSV filter")}
          onSubmit={(e) => {
            e.preventDefault();
            patch({ csvFilter: { column, op, value } });
          }}
        >
          <select
            aria-label={tr("Filter column")}
            value={column}
            onChange={(e) => setColumn(Number(e.target.value))}
          >
            {model.columns.slice(0, 1000).map((c) => (
              <option key={c.id} value={c.index}>
                {c.index + 1} · {c.name.slice(0, 100)}
              </option>
            ))}
          </select>
          <select
            aria-label={tr("Filter operation")}
            value={op}
            onChange={(e) => setOp(e.target.value as CsvFilterOp)}
          >
            {(
              [
                "contains",
                "equals",
                "empty",
                "not-empty",
                ">",
                ">=",
                "<",
                "<=",
                "=",
              ] as CsvFilterOp[]
            ).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            aria-label={tr("Filter value")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit">{tr("Apply")}</button>
          {filter && (
            <button
              type="button"
              onClick={() => patch({ csvFilter: undefined })}
            >
              {tr("Clear filter")}</button>
          )}
        </form>
      )}
      <div className="csv-status" role="status">
        {model.status === "indexing"
          ? tr("Indexing {v0}% · first rows are available", { v0: Math.floor((model.processedBytes / (model.size || 1)) * 100) })
          : model.status === "limited"
            ? tr("Large Dataset Mode · partial dataset")
            : model.status === "error"
              ? tr("Indexing stopped · partial dataset")
              : tr("Indexed")}
        {projectBusy
          ? tr("· Updating view…")
          : activeRows
            ? tr(" · {v0} visible rows", { v0: formatNumber(activeRows.length) })
            : ""}
        {message && tr(" · {v0}", { v0: message })}
      </div>
      {model.diagnostics.length > 0 && props.activeCapability !== 'inspect' && (
        <details className="csv-diagnostics">
          <summary>{model.diagnostics.length} {' '}{tr("diagnostics")}</summary>
          {model.diagnostics.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </details>
      )}
      {cellPreview && selection.kind === "cell" && (
        <div
          className="csv-surface"
          role="region"
          aria-label={tr("Cell preview")}
          tabIndex={0}
          ref={previewRef}
        >
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflow: "auto",
              maxHeight: 200,
              maxWidth: "100%",
            }}
          >
            {selection.rawValue.slice(0, CSV_CONFIG.inspectPreview)}
          </pre>
          <button onClick={() => setCellPreview(false)}>
            {tr("Close cell preview")}</button>
        </div>
      )}
      <div className={`csv-panes ${mode === "split" ? "csv-split" : ""}`}>
        {mode !== "source" && (
          <CsvGrid
            key={`${mode}-table`}
            model={model}
            hiddenColumns={hiddenColumns}
            header={header}
            rows={activeRows}
            selection={selection}
            select={select}
            widths={widths}
            resize={(col, width) =>
              patch({
                csvWidths: {
                  ...widths,
                  [`col:${col}`]: Math.max(60, Math.min(800, width)),
                },
              })
            }
            scroll={saved}
            saveScroll={(top, left) => {
              session.metadata[scrollKey] = { top, left };
            }}
            navigation={navigation}
            inspect={() => setCellPreview(true)}
          />
        )}
        {mode !== "table" && (
          <CsvSource
            key={`${mode}-source`}
            model={model}
            scroll={Number(metadata[`csv-${mode}-source`] ?? 0)}
            save={(top) => {
              session.metadata[`csv-${mode}-source`] = top;
            }}
          />
        )}
      </div>
    </section>
  );
}
