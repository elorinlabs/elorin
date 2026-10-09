import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import {ViewerDiagnostic} from '../../components/ViewerDiagnostic';
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { DataModel } from "./data-model";
import { DataGrid } from "./DataGrid";
import type { DataFilter } from "./types";
import { dataCell } from "./precision";
import { visibleRange } from "../../shared/virtual-grid";
import { useBinaryActivity } from '../hex/activity';
import { ScientificPreview } from './ScientificPreview';
export function DataViewer(props: ViewerRenderProps<DataModel>) {
  useLocale();
  const { model, context, session, updateSession } = props;
  useSyncExternalStore(model.subscribe, model.snapshot);
  const active = useBinaryActivity(context.active ?? true);
  useEffect(() => { model.setActive(active); }, [model, active]);
  const [preview, setPreview] = useState(false);
  const [structure, setStructure] = useState(true),
    [query, setQuery] = useState(""),
    [treeTop, setTreeTop] = useState(0),
    [column, setColumn] = useState(0),
    [op, setOp] = useState<DataFilter["op"]>("contains"),
    [value, setValue] = useState(""),
    [go, setGo] = useState("1"),
    [gridKey, setGridKey] = useState(0),
    [message, setMessage] = useState("");
  const inspect = () => context.requestCapability?.("inspect");
  const copy = async (raw: boolean) => {
    const s = model.cell;
    if (!s) return;
    const cell = model.getCell(s.row, s.column);
    if (cell)
      await navigator.clipboard.writeText(raw ? cell.raw : cell.display);
    else if (s.row === -1)
      await navigator.clipboard.writeText(
        model.selected?.columns?.[s.column]?.name ?? "",
      );
    else if (s.column === -1)
      await navigator.clipboard.writeText(
        (model.selected?.columns ?? [])
          .map((_, c) => model.getCell(s.row, c)?.raw ?? "")
          .join("\t"),
      );
  };
  useEffect(
    () =>
      context.registerActions?.([
        { id: 'data-preview', label: preview ? 'Hide sample preview' : 'Sample preview', disabled: !model.cache.size, action: () => setPreview(v => !v) },
        { id: 'data-cancel', get label() { return tr("Cancel reading"); }, disabled: !model.busy, action: () => model.setActive(false) },
        { id: 'data-resume', get label() { return tr("Resume reading"); }, disabled: !!model.provider, action: () => model.setActive(true) },
        {
          id: "data-structure",
          label: structure ? "Hide structure" : "Structure",
          primary: true,
          action: () => setStructure((v) => !v),
        },
        {
          id: "data-copy-raw",
          get label() { return tr("Copy Raw Value"); },
          disabled: !model.cell,
          action: () => copy(true),
        },
        {
          id: "data-copy-display",
          get label() { return tr("Copy Display Value"); },
          disabled: !model.cell,
          action: () => copy(false),
        },
        {
          id: "data-count",
          get label() { return tr("Count rows"); },
          disabled:
            model.family !== "database" ||
            !model.provider?.count ||
            !model.selected ||
            !["table", "view"].includes(model.selected.kind) ||
            model.busy,
          action: () => model.calculateCount(),
        },
        {
          id: "data-stats",
          get label() { return tr("Statistics of loaded sample"); },
          disabled: !model.cache.size,
          action: () => {
            const cells = [...model.cache.values()]
              .flatMap((p) => p.values.flat())
              .filter((c) => c.type !== "null");
            const numeric = cells
              .filter(
                (c) =>
                  /float|real|double/.test(c.type) &&
                  Number.isFinite(Number(c.raw)),
              )
              .map((c) => Number(c.raw));
            setMessage(
              tr("Sampled {v0} loaded cells · {v1}", { v0: cells.length, v1: numeric.length ? `float min ${dataCell(Math.min(...numeric)).display} / max ${dataCell(Math.max(...numeric)).display}` : "integer/decimal statistics omitted to preserve precision" }),
            );
          },
        },
      ]),
    [context.registerActions, structure, preview, model.snapshot(), model.cell],
  );
  useEffect(() => {
    if (props.activeCapability === "outline") setStructure(true);
  }, [props.activeCapability]);
  useEffect(() => {
    if (session.metadata.dataNode && model.provider)
      void model.select(String(session.metadata.dataNode));
  }, [model.provider]);
  const select = async (id: string) => {
    await model.select(id);
    updateSession({ metadata: { ...session.metadata, dataNode: id } });
    setGridKey((k) => k + 1);
  };
  const filtered = model.nodes.filter((n) =>
    n.name.toLowerCase().includes(query.toLowerCase()),
  );
  const { start, end } = visibleRange(treeTop, 420, 32, filtered.length, 4);
  return (
    <div className={`data-viewer data-${model.family}`}>
      {(props.activeCapability === "search" || model.family === "database") && (
        <div className="data-filter">
          <select
            aria-label={tr("Search column")}
            value={column}
            onChange={(e) => setColumn(Number(e.target.value))}
          >
            {model.selected?.columns?.map((c, i) => (
              <option key={i} value={i}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label={tr("Filter operation")}
            value={op}
            onChange={(e) => setOp(e.target.value as DataFilter["op"])}
          >
            {["contains", "equals", "greater", "less", "null"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <input
            aria-label={tr("Filter value")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            disabled={model.busy}
            onClick={() => {
              model.filter = { column, op, value };
              model.position = 0;
              void model.reset();
              setGridKey((k) => k + 1);
            }}
          >
            {tr("Apply")}</button>
          <button
            onClick={() => {
              model.filter = undefined;
              model.position = 0;
              void model.reset();
              setGridKey((k) => k + 1);
            }}
          >
            {tr("Clear")}</button>
          {model.family !== "database" && (
            <span>{tr("Filter applies to loaded sample only")}</span>
          )}
        </div>
      )}
      <div className="data-main">
        {structure && (
          <aside className="data-navigation">
            <input
              aria-label={tr("Search structure")}
              placeholder={tr("Find table or dataset…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              className="data-tree"
              role="tree"
              onScroll={(e) => setTreeTop(e.currentTarget.scrollTop)}
            >
              <div
                style={{ height: filtered.length * 32, position: "relative" }}
              >
                {filtered.slice(start, end).map((n, i) => (
                  <div
                    key={n.id}
                    className={`data-node ${model.selected?.id === n.id ? "selected" : ""}`}
                    role="treeitem"
                    style={{
                      position: "absolute",
                      top: (start + i) * 32,
                      height: 32,
                      left: 0,
                      right: 0,
                    }}
                  >
                    <button title={n.id} onClick={() => void select(n.id)}>
                      {n.name}
                      <small>{n.kind}</small>
                    </button>
                    {n.expandable && (
                      <button
                        aria-label={tr("Expand {v0}", { v0: n.name })}
                        onClick={() => void model.expand(n.id)}
                      >
                        ›
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
        <section className="data-content">
          {model.selected?.shape && model.selected.shape.length > 2 && (
            <div className="data-slice">
              {model.selected.shape.slice(0, -2).map((n, i) => (
                <label key={i}>
                  {tr("Dimension")}{i}
                  <input
                    type="number"
                    min={0}
                    max={n - 1}
                    value={model.fixed[i] ?? 0}
                    onChange={(e) => {
                      model.fixed = [...model.fixed];
                      model.fixed[i] = Number(e.target.value);
                      model.position = 0;
                      void model.reset();
                      setGridKey((k) => k + 1);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {model.error && (
            <div className="data-error" role="alert">
              <ViewerDiagnostic error={model.error}/>
            </div>
          )}
          {model.busy && <p role="status">{tr("Reading structure / bounded data…")}</p>}
          {model.selected?.columns?.length ? (
            <DataGrid
              key={`${model.selected.id}:${gridKey}`}
              model={model}
              inspect={inspect}
            />
          ) : (
            !model.busy && (
              <p className="data-placeholder">
                {model.selected
                  ? JSON.stringify(model.selected.metadata, null, 2)
                  : tr("Select a table, variable or dataset")}
              </p>
            )
          )}
        </section>
      </div>
      {preview && active && <ScientificPreview model={model}/>}
      <footer className="data-status">
        <span>
          {tr("Read only ·")}{model.selected?.name} ·{" "}
          {model.count === undefined
            ? tr("Rows unknown")
            : tr("{v0} logical rows", { v0: formatNumber(model.count) })}{" "}
          {tr("· cache")}{model.cache.size} {tr("pages")}{model.provider?.capabilities?.randomAccess === false && tr("· Stream preview uses bounded cache; source is not randomly seekable")}
        </span>
        <label>
          {tr("Go to logical row")}{" "}
          <input
            aria-label={tr("Go to row")}
            type="number"
            min={1}
            value={go}
            onChange={(e) => setGo(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            const n = Number(go) - 1;
            if (
              Number.isSafeInteger(n) &&
              n >= 0 &&
              n < (model.count ?? 100_000_000)
            ) {
              model.position = n;
              void model.request(n, model.columnsWindow);
              setGridKey((k) => k + 1);
            }
          }}
        >
          {tr("Go")}</button>
        {message && <span role="status">{tr(message)}</span>}
      </footer>
    </div>
  );
}
