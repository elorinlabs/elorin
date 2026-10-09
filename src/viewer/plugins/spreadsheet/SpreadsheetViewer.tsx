import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import { SparseAxis, type GridSelection } from "../../shared/virtual-grid";
import {
  address,
  coordinate,
  columnName,
  loadSheet,
  type Workbook,
  type Sheet,
} from "./spreadsheet-model";
function WorkbookInfo({ model }: { model: Workbook }) {
  useLocale();
  return (
    <>
      <p>
        {model.sheets.length} {' '}{tr("sheets •")}{" "}
        {model.sheets.filter((s) => s.state === "visible").length} {' '}{tr("visible •")}{" "}
        {model.sheets.filter((s) => s.state !== "visible").length} {tr("hidden")}</p>
      <p>
        {tr("Macros:")}{model.pkg?.macros ? tr("Present") : tr("Not detected")} {tr("• Execution Disabled by Prism")}</p>
      <p>
        {model.externalLinks} {' '}{tr("external workbook links •")}{' '}{model.connections}{" "}
        {tr("connections •")}{model.pivots} {tr("pivot tables. Refresh disabled.")}</p>
      <p>{tr("Formula recalculation disabled. Saved results only.")}</p>
      <p>{model.pkg ? formatNumber(model.pkg.context.file.size) : "—"} {' '}{tr("bytes •")}{' '}{model.styles.length} {' '}{tr("cell styles •")}{' '}{model.sheets.filter(s=>s.loaded).length} {' '}{tr("parsed sheets")}</p>
      <p>{tr("Parsed-sheet totals:")}{' '}{model.sheets.filter(s=>s.loaded).reduce((n,s)=>n+s.formulas,0)} {' '}{tr("formulas •")}{' '}{model.sheets.filter(s=>s.loaded).reduce((n,s)=>n+s.charts.length,0)} {' '}{tr("charts •")}{' '}{model.sheets.filter(s=>s.loaded).reduce((n,s)=>n+s.images.length,0)} {' '}{tr("images. Other sheets are inspected when loaded.")}</p>
      <details>
        <summary>{tr("Defined names (")}{model.names.length})</summary>
        {model.names.map((n, i) => (
          <p key={i}>
            {n.name}: {n.value}
          </p>
        ))}
      </details>
      <details>
        <summary>{tr("Package metadata / embedded objects")}</summary>
        <pre>
          {JSON.stringify(
            {
              metadata: model.pkg?.metadata,
              attachments: model.pkg?.attachments,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </>
  );
}
export function SpreadsheetInspector({ model }: { model: Workbook }) {
  useLocale();
  return (
    <div className="m10-inspector">
      <WorkbookInfo model={model} />
    </div>
  );
}
export function SpreadsheetViewer({
  model,
  context,
  activeCapability,
  session,
  updateSession,
}: ViewerRenderProps<Workbook>) {
  useLocale();
  const [index, setIndex] = useState(
      Math.max(
        0,
        Math.min(
          model.sheets.length - 1,
          Number(session.metadata.sheet) || model.initial,
        ),
      ),
    ),
    [sheet, setSheet] = useState<Sheet | undefined>(model.sheets[index]),
    [selection, select] = useState<GridSelection>({
      kind: "cell",
      row: 0,
      column: 0,
    }),
    [view, setView] = useState({ top: 0, left: 0, width: 900, height: 450 }),
    [query, setQuery] = useState(""),
    [scope, setScope] = useState("current"),
    [formulas, setFormulas] = useState(false),
    [results, setResults] = useState<
      { sheet: number; address: string; display: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hidden, setHidden] = useState(false),
    [goto, setGoto] = useState("A1"),
    [inspect, setInspect] = useState(false),
    [search, setSearch] = useState(false),
    [generation, setGeneration] = useState(0);
  const grid = useRef<HTMLDivElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    goRef = useRef<HTMLInputElement>(null),
    operation = useRef(0);
  const rowAxis = useMemo(
      () => new SparseAxis(sheet?.rows ?? 1, 28, sheet?.rowSizes),
      [sheet, generation],
    ),
    colAxis = useMemo(
      () => new SparseAxis(sheet?.columns ?? 1, 112, sheet?.colSizes),
      [sheet, generation],
    );
  const cell = sheet?.cells.get(address(selection.row, selection.column));
  useEffect(() => {
    if (sheet && !sheet.loaded) void switchSheet(index);
  }, []);
  useEffect(() => {
    if (activeCapability === "search") {
      setSearch(true);
      searchRef.current?.focus();
    }
    if (activeCapability === "inspect") setInspect(true);
  }, [activeCapability]);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () =>
      setView((v) => ({
        ...v,
        width: el.clientWidth || 900,
        height: el.clientHeight || 450,
      }));
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : undefined;
    ro?.observe(el);
    return () => {
      operation.current++;
      ro?.disconnect();
    };
  }, [!!sheet]);
  async function switchSheet(i: number) {
    const token = ++operation.current;
    setBusy(true);
    setError("");
    try {
      const s = await loadSheet(model, i, context.signal);
      if (token !== operation.current) return;
      setIndex(i);
      setSheet(s);
      setGeneration((v) => v + 1);
      select({ kind: "cell", row: 0, column: 0 });
      setView((v) => ({ ...v, top: 0, left: 0 }));
      if (grid.current) {
        grid.current.scrollTop = 0;
        grid.current.scrollLeft = 0;
      }
      updateSession({ metadata: { ...session.metadata, sheet: i } });
    } catch (e) {
      if (!context.signal.aborted) setError(uiError(e));
    } finally {
      if (token === operation.current) setBusy(false);
    }
  }
  async function jump(i: number, key: string) {
    const xy = coordinate(key);
    if (!xy) return;
    if (i !== index) await switchSheet(i);
    select({ kind: "cell", row: xy[0], column: xy[1] });
    setGoto(key);
    requestAnimationFrame(() => {
      const s = model.sheets[i],
        rows = new SparseAxis(Math.max(s.rows, xy[0] + 1), 28, s.rowSizes),
        cols = new SparseAxis(Math.max(s.columns, xy[1] + 1), 112, s.colSizes);
      if (xy[0] >= s.rows || xy[1] >= s.columns) {
        s.rows = Math.max(s.rows, xy[0] + 1);
        s.columns = Math.max(s.columns, xy[1] + 1);
        setGeneration((v) => v + 1);
      }
      if (grid.current) {
        grid.current.scrollTop = rows.offset(xy[0]);
        grid.current.scrollLeft = cols.offset(xy[1]);
        grid.current.focus();
      }
    });
  }
  async function find() {
    const token = ++operation.current;
    setBusy(true);
    setError("");
    const found: typeof results = [];
    try {
      for (let i = 0; i < model.sheets.length; i++) {
        if (scope === "current" && i !== index) continue;
        const s = await loadSheet(model, i, context.signal);
        for (const c of s.cells.values())
          if (
            (formulas ? `${c.display}\n${c.formula ?? ""}` : c.display)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())
          ) {
            found.push({ sheet: i, address: c.address, display: c.display });
            if (found.length === 500) break;
          }
        if (found.length === 500) break;
      }
      if (token === operation.current) {
        setResults(found);
        await loadSheet(model, index, context.signal);
        setGeneration((v) => v + 1);
      }
    } catch (e) {
      setError(uiError(e));
    } finally {
      if (token === operation.current) setBusy(false);
    }
  }
  function copy() {
    if (!sheet) return;
    let value = "";
    if (selection.kind === "cell") value = cell?.display ?? "";
    else {
      const cells = [...sheet.cells.values()]
        .filter((c) =>
          selection.kind === "row"
            ? c.row === selection.row
            : c.column === selection.column,
        )
        .sort((a, b) =>
          selection.kind === "row" ? a.column - b.column : a.row - b.row,
        )
        .slice(0, 10000);
      const last = cells.at(-1),
        extent = last
          ? (selection.kind === "row" ? last.column : last.row) + 1
          : 0;
      if (extent > 10000) {
        setError(
          tr("Copy is limited to 10,000 positions. Select a smaller range."),
        );
        return;
      }
      const values = Array<string>(extent).fill("");
      for (const c of cells)
        values[selection.kind === "row" ? c.column : c.row] = c.display;
      value = values.join(selection.kind === "row" ? "\t" : "\n");
    }
    return navigator.clipboard?.writeText(value);
  }
  useEffect(() =>
    context.registerActions?.([
      { id: "inspect", get label() { return tr("Inspect"); }, action: () => setInspect((v) => !v) },
      { id: "copy", get label() { return tr("Copy selection"); }, shortcut: "Ctrl+C", action: copy },
      {
        id: "goto",
        get label() { return tr("Go to cell"); },
        shortcut: "Ctrl+G",
        action: () => goRef.current?.focus(),
      },
      {
        id: "hidden-sheets",
        get label() { return tr("Hidden sheets"); },
        action: () => setHidden((v) => !v),
      },
      {
        id: "search",
        get label() { return tr("Search"); },
        action: () => {
          setSearch((v) => !v);
          searchRef.current?.focus();
        },
      },
    ]),
  );
  async function link(value: string) {
    if (value.startsWith("#")) {
      const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)$/i.exec(
        value.slice(1),
      );
      if (m) {
        const i = model.sheets.findIndex(
          (s) => s.name === (m[1]?.replaceAll("''", "'") ?? m[2]),
        );
        if (i >= 0) await jump(i, m[3] + m[4]);
      } else await jump(index, value.slice(1));
    } else if (
      /^https?:\/\//i.test(value) &&
      window.confirm(`Open external link?\n${value}`)
    )
      await context.services.file.openUrl?.(value);
    else if(!/^https?:\/\//i.test(value)&&!value.startsWith('#'))setError(tr("This hyperlink uses a blocked scheme."));
  }
  if (model.error || model.limited)
    return (
      <div className="m10-message">
        <h3>
          {model.limited ? tr("Limited Preview") : tr("Workbook preview unavailable")}
        </h3>
        <p>{model.error ?? model.limited}</p>
        <button onClick={() => context.services.file.openExternal?.()}>
          {tr("Open externally")}</button>
      </div>
    );
  if (!sheet) return null;
  const rows = [
      ...new Set([
        ...Array.from(
          { length: Math.min(sheet.freezeRows, sheet.rows) },
          (_, i) => i,
        ),
        ...rowAxis.window(view.top, view.height),
      ]),
    ].filter((i) => rowAxis.size(i) > 0),
    cols = [
      ...new Set([
        ...Array.from(
          { length: Math.min(sheet.freezeCols, sheet.columns) },
          (_, i) => i,
        ),
        ...colAxis.window(view.left, view.width),
      ]),
    ].filter((i) => colAxis.size(i) > 0);
  const x = (i: number) =>
      48 + (i < sheet.freezeCols ? view.left : 0) + colAxis.offset(i),
    y = (i: number) =>
      28 + (i < sheet.freezeRows ? view.top : 0) + rowAxis.offset(i);
  const visibleMerges = sheet.merges.filter(
    (m) =>
      colAxis.offset(m.endColumn + 1) >= view.left &&
      colAxis.offset(m.column) <= view.left + view.width &&
      rowAxis.offset(m.endRow + 1) >= view.top &&
      rowAxis.offset(m.row) <= view.top + view.height,
  );
  function renderCell(r: number, c: number, merge?: Sheet["merges"][number]) {
    const data = sheet!.cells.get(address(r, c)),
      chosen =
        selection.kind === "row"
          ? r === selection.row
          : selection.kind === "column"
            ? c === selection.column
            : r === selection.row && c === selection.column;
    return (
      <div
        role="gridcell"
        key={`${r}:${c}`}
        data-address={address(r, c)}
        aria-rowindex={r + 1}
        aria-colindex={c + 1}
        aria-selected={chosen}
        className={`m10-cell ${chosen ? "selected" : ""}`}
        style={{
          ...data?.style,
          left: x(c),
          top: y(r),
          width: merge
            ? colAxis.offset(merge.endColumn + 1) - colAxis.offset(c)
            : colAxis.size(c),
          height: merge
            ? rowAxis.offset(merge.endRow + 1) - rowAxis.offset(r)
            : rowAxis.size(r),
          zIndex: merge
            ? 5
            : r < sheet!.freezeRows || c < sheet!.freezeCols
              ? 4
              : 1,
        }}
        onClick={() => {
          select({ kind: "cell", row: r, column: c });
          setGoto(address(r, c));
        }}
        title={data?.comment ?? data?.formula ?? data?.display}
      >
        {data?.link ? (
          <button
            className="m10-link"
            onClick={(e) => {
              e.stopPropagation();
              void link(data.link!);
            }}
          >
            {data.display || tr("Link")}
          </button>
        ) : (
          data?.display
        )}
        {data?.comment && (
          <span className="comment-mark" aria-label={tr("Comment")}>
            ◥
          </span>
        )}
      </div>
    );
  }
  return (
    <section
      className="m10-viewer spreadsheet-viewer"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
          e.preventDefault();
          goRef.current?.focus();
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === "c" &&
          !(e.target instanceof HTMLInputElement)
        ) {
          e.preventDefault();
          void copy();
        }
      }}
    >
      <div className="m10-controls">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void jump(index, goto);
          }}
        >
          <input
            ref={goRef}
            aria-label={tr("Go to cell")}
            value={goto}
            onChange={(e) => setGoto(e.target.value.toUpperCase())}
          />
          <button>{tr("Go")}</button>
        </form>
        <span className="m10-formula">
          {cell?.formula !== undefined
            ? tr("={v0} • {v1}", { v0: cell.formula, v1: cell.display })
            : (cell?.display ?? "Blank cell")}
        </span>
        <button onClick={() => setInspect((v) => !v)}>{tr("Cell details")}</button>
      </div>
      {search && (
        <div className="m10-search">
          <input
            ref={searchRef}
            aria-label={tr("Search workbook")}
            placeholder={tr("Find displayed values…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label={tr("Search scope")}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="current">{tr("Current Sheet")}</option>
            <option value="all">{tr("Entire Workbook")}</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={formulas}
              onChange={(e) => setFormulas(e.target.checked)}
            />{" "}
            {tr("Include formulas")}</label>
          <button disabled={busy || !query} onClick={() => void find()}>
            {tr("Find")}</button>
          <button onClick={() => setSearch(false)}>{tr("Close")}</button>
        </div>
      )}
      {results.length > 0 && search && (
        <div className="m10-results">
          {results.map((r, i) => (
            <button key={i} onClick={() => void jump(r.sheet, r.address)}>
              {model.sheets[r.sheet].name}!{r.address} —{" "}
              {r.display.slice(0, 80)}
            </button>
          ))}
          {results.length === 500 && <p>{tr("First 500 matches shown.")}</p>}
        </div>
      )}
      {error && <p role="alert">{tr(error)}</p>}
      {busy && <p role="status">{tr("Loading worksheet…")}</p>}
      <div className="m10-body">
        <div
          ref={grid}
          className="m10-grid"
          role="grid"
          aria-label={tr("{v0} worksheet", { v0: sheet.name })}
          aria-rowcount={sheet.rows}
          aria-colcount={sheet.columns}
          tabIndex={0}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop,
              left = e.currentTarget.scrollLeft;
            setView((v) => ({ ...v, top, left }));
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const d: Record<string, [number, number]> = {
              ArrowDown: [1, 0],
              ArrowUp: [-1, 0],
              ArrowRight: [0, 1],
              ArrowLeft: [0, -1],
              PageDown: [15, 0],
              PageUp: [-15, 0],
            };
            if (d[e.key]) {
              e.preventDefault();
              void jump(
                index,
                address(
                  Math.max(
                    0,
                    Math.min(sheet.rows - 1, selection.row + d[e.key][0]),
                  ),
                  Math.max(
                    0,
                    Math.min(sheet.columns - 1, selection.column + d[e.key][1]),
                  ),
                ),
              );
            }
          }}
        >
          <div
            className="m10-grid-space"
            style={{
              width: Math.max(view.width, colAxis.total + 48),
              height: Math.max(view.height, rowAxis.total + 28),
            }}
          >
            {rows.map((r) => (
              <div
                key={`r${r}`}
                role="rowheader"
                className="m10-row-head"
                style={{
                  left: view.left,
                  top: y(r),
                  height: rowAxis.size(r),
                  zIndex: r < sheet.freezeRows ? 9 : 6,
                }}
                onClick={() => select({ kind: "row", row: r, column: 0 })}
              >
                {r + 1}
              </div>
            ))}
            {cols.map((c) => (
              <div
                key={`c${c}`}
                role="columnheader"
                className="m10-col-head"
                style={{
                  left: x(c),
                  top: view.top,
                  width: colAxis.size(c),
                  zIndex: c < sheet.freezeCols ? 9 : 6,
                }}
                onClick={() => select({ kind: "column", row: 0, column: c })}
              >
                {columnName(c)}
              </div>
            ))}
            {rows.flatMap((r) =>
              cols
                .filter(
                  (c) =>
                    !sheet.merges.some(
                      (m) =>
                        r >= m.row &&
                        r <= m.endRow &&
                        c >= m.column &&
                        c <= m.endColumn,
                    ),
                )
                .map((c) => renderCell(r, c)),
            )}
            {visibleMerges.map((m) => renderCell(m.row, m.column, m))}
            <div
              className="m10-corner"
              style={{ left: view.left, top: view.top }}
            />
          </div>
        </div>
        {inspect && (
          <aside className="m10-inspector">
            <button onClick={() => setInspect(false)}>{tr("Close details")}</button>
            <h4>
              {sheet.name}!{address(selection.row, selection.column)}
            </h4>
            <dl>
              {Object.entries({
                type: cell?.type ?? "blank",
                raw: cell?.raw ?? "",
                display: cell?.display ?? "",
                formula: cell?.formula ?? "—",
                numberFormat: cell?.numFmt ?? "General",
                comment: cell?.comment ?? "—",
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p>
              {sheet.usedRange} • {sheet.cells.size} {' '}{tr("stored cells •")}{" "}
              {sheet.merges.length} {' '}{tr("merges •")}{' '}{sheet.formulas} {tr("formulas")}</p>
            <p>
              {tr("Hidden:")}{sheet.hiddenRows} {' '}{tr("rows /")}{' '}{sheet.hiddenCols} {tr("columns. Freeze:")}{sheet.freezeRows} {' '}{tr("rows /")}{' '}{sheet.freezeCols} {tr("columns.")}</p>
            <p>
              {sheet.conditionalFormats} {tr("conditional formatting rules detected (static styles shown).")}</p>
            <WorkbookInfo model={model} />
            {sheet.charts.map((c, i) => (
              <div className="m10-placeholder" key={i}>
                <strong>{tr("Chart — static preview unavailable")}</strong>
                <p>{c.detail}</p>
                <p>{c.label}</p>
              </div>
            ))}
            {sheet.images.map((n, i) => (
              <img
                className="m10-embedded-image"
                key={i}
                src={model.pkg?.image(n)}
                alt={tr("Embedded worksheet image {v0}", { v0: i + 1 })}
              />
            ))}
          </aside>
        )}
      </div>
      {(sheet.charts.length > 0 || sheet.images.length > 0) && (
        <div className="m10-objects">
          <button onClick={() => setInspect(true)}>
            {sheet.charts.length} {' '}{tr("charts •")}{' '}{sheet.images.length} {tr("embedded images — view objects")}</button>
        </div>
      )}
      <div className="m10-tabs" role="tablist" aria-label={tr("Workbook sheets")}>
        {model.sheets.map(
          (s, i) =>
            s.state === "visible" && (
              <button
                role="tab"
                aria-selected={i === index}
                key={i}
                disabled={busy}
                onClick={() => void switchSheet(i)}
              >
                {s.name}
              </button>
            ),
        )}
        {hidden &&
          model.sheets.map(
            (s, i) =>
              s.state !== "visible" && (
                <button
                  role="tab"
                  aria-selected={i === index}
                  key={i}
                  onClick={() => void switchSheet(i)}
                >
                  {s.name} ({s.state})
                </button>
              ),
          )}
      </div>
      <footer className="m10-status">
        {sheet.name} • {formatNumber(sheet.rows)} {' '}{tr("rows ×")}{" "}
        {formatNumber(sheet.columns)} {tr("columns • Saved results only")}{sheet.state !== "visible" ? tr(" • Viewing {v0} sheet", { v0: sheet.state }) : ""}
      </footer>
    </section>
  );
}
