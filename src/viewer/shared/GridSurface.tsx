import { formatNumber } from "../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { visibleRange, intersectsViewport } from "./virtual-grid";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
const CSV_CONFIG = { overscan: 6, inspectPreview: 32768, cellPreview: 240 };
export interface GridDataSource {
  columns: { id: string; name: string; width: number; type?: string }[];
  rowSource: { count: number; get(row: number): string[] | undefined };
}
import type { CsvSelection } from "../plugins/csv/csv-types";
interface Props {
  onEditCell?: (row: number, column: number) => void;
  label?: string;
  onWindow?: (start: number, end: number, columns: number[]) => void;
  model: GridDataSource;
  hiddenColumns?: readonly number[];
  header: boolean;
  rows?: number[];
  selection: CsvSelection;
  select: (s: CsvSelection) => void;
  widths: Record<string, number>;
  resize: (col: number, width: number) => void;
  scroll: { top: number; left: number };
  saveScroll: (top: number, left: number) => void;
  navigation: number;
  inspect: () => void;
}
export function GridSurface({
  onEditCell,
  label = "CSV data table",
  onWindow,
  model,
  hiddenColumns,
  header,
  rows,
  selection,
  select,
  widths,
  resize,
  scroll,
  saveScroll,
  navigation,
  inspect,
}: Props) {
  useLocale();
  const ref = useRef<HTMLDivElement>(null),
    nav = useRef(navigation);
  const [view, setView] = useState({
    top: scroll.top,
    left: scroll.left,
    width: 800,
    height: 420,
  });
  const count =
    rows?.length ?? Math.max(0, model.rowSource.count - (header ? 1 : 0));
  const scaleForHeight=(height:number)=>Math.max(1,((count+1)*32-height)/Math.max(1,16000000-height));
  const scrollScale = scaleForHeight(view.height);
  const positions = useMemo(() => {
    let x = 52;
    return model.columns.map((c, index) => {
      const width = hiddenColumns?.includes(index) ? 0 : widths[c.id] ?? c.width;
      const p = { left: x, width };
      x += width;
      return p;
    });
  }, [model.columns, widths, hiddenColumns]);
  const total = positions.length
    ? positions.at(-1)!.left + positions.at(-1)!.width
    : 52;
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = scroll.top / scaleForHeight(ref.current.clientHeight || 420);
      ref.current.scrollLeft = scroll.left;
      const measure = () =>
        setView((v) => ({
          ...v,
          width: ref.current!.clientWidth || 800,
          height: Math.min(ref.current!.clientHeight || 420, 2048),
        }));
      measure();
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(measure);
        observer.observe(ref.current);
        return () => observer.disconnect();
      }
    }
  }, []);
  const original = (index: number) =>
    rows ? rows[index] : index + (header ? 1 : 0);
  useEffect(() => {
    if (nav.current === navigation) return;
    nav.current = navigation;
    if (selection.kind !== "cell" || !ref.current) return;
    const index = rows
        ? rows.indexOf(selection.row)
        : selection.row - (header ? 1 : 0),
      p = positions[selection.column];
    if (index < 0 || !p) return;
    const el = ref.current,
      y = index * 32;
    if (y < el.scrollTop * scrollScale) el.scrollTop = y / scrollScale;
    else if (
      y + 64 >
      el.scrollTop * scrollScale + (el.clientHeight || view.height)
    )
      el.scrollTop = (y + 64 - (el.clientHeight || view.height)) / scrollScale;
    if (p.left < el.scrollLeft + 52) el.scrollLeft = p.left - 52;
    else if (p.left + p.width > el.scrollLeft + (el.clientWidth || view.width))
      el.scrollLeft = p.left + p.width - (el.clientWidth || view.width);
    setView((v) => ({
      ...v,
      top: el.scrollTop * scrollScale,
      left: el.scrollLeft,
    }));
    saveScroll(el.scrollTop * scrollScale, el.scrollLeft);
  }, [navigation, selection, positions, rows, header, saveScroll]);
  const { start, end } = visibleRange(
    view.top,
    Math.min(view.height, 2048),
    32,
    count,
    CSV_CONFIG.overscan,
  );
  const cols = positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) =>
      p.width > 0 && intersectsViewport(p.left, p.width, view.left, view.width),
    );
  const windowKey = cols.map((c) => c.i).join(",");
  useEffect(() => {
    onWindow?.(
      start,
      end,
      cols.map((c) => c.i),
    );
  }, [start, end, windowKey, onWindow]);
  const active =
    selection.kind === "cell"
      ? `csv-cell-${selection.row}-${selection.column}`
      : undefined;
  function cell(row: number, col: number) {
    const rawValue = model.rowSource.get(row)?.[col] ?? "";
    select({
      kind: "cell",
      row,
      column: col,
      columnId: `col:${col}`,
      rawValue,
      parsedValue: rawValue,
    });
  }
  function key(event: React.KeyboardEvent) {
    const visibleColumns=model.columns.map((_,i)=>i).filter(i=>!hiddenColumns?.includes(i));
    if (!count || !visibleColumns.length) return;
    let index =
        selection.kind === "cell"
          ? rows
            ? rows.indexOf(selection.row)
            : selection.row - (header ? 1 : 0)
          : 0,
      col = Math.max(0,visibleColumns.indexOf(selection.kind === "cell" ? selection.column : visibleColumns[0]));
    switch (event.key) {
      case "ArrowDown":
        index++;
        break;
      case "ArrowUp":
        index--;
        break;
      case "ArrowLeft":
        col--;
        break;
      case "ArrowRight":
        col++;
        break;
      case "Home":
        col = 0;
        break;
      case "End":
        col = visibleColumns.length - 1;
        break;
      case "PageDown":
        index += Math.max(1, Math.floor(view.height / 32) - 1);
        break;
      case "PageUp":
        index -= Math.max(1, Math.floor(view.height / 32) - 1);
        break;
      case "Enter":
        if (onEditCell && selection.kind === 'cell') onEditCell(selection.row, selection.column); else inspect();
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    cell(
      original(Math.max(0, Math.min(count - 1, index))),
      visibleColumns[Math.max(0, Math.min(visibleColumns.length - 1, col))],
    );
  }
  const drag = useRef<
    { col: number; x: number; width: number; pointer: number } | undefined
  >(undefined);
  return (
    <div
      ref={ref}
      className="csv-grid"
      style={{overflowAnchor:'none'}}
      role="grid"
      aria-label={label}
      aria-rowcount={count + 1}
      aria-colcount={model.columns.length + 1}
      tabIndex={0}
      aria-activedescendant={
        active &&
        selection.kind === "cell" &&
        Array.from({ length: Math.max(0, end - start) }, (_, n) =>
          original(start + n),
        ).includes(selection.row) &&
        cols.some((c) => c.i === selection.column)
          ? active
          : undefined
      }
      onKeyDown={key}
      onScroll={(e) => {
        const el = e.currentTarget;
        const top=el.scrollTop>=el.scrollHeight-el.clientHeight-1&&scrollScale>1
          ? Math.max(0,(count+1)*32-el.clientHeight) : el.scrollTop*scaleForHeight(el.clientHeight);
        setView((v) => ({
          ...v,
          top,
          left: el.scrollLeft,
        }));
        saveScroll(top, el.scrollLeft);
      }}
    >
      <div
        style={{
          width: total,
          height: Math.min((count + 1) * 32,16000000),
          overflow:'hidden',
          minHeight: 64,
          position: "relative",
        }}
      >
        <div
          role="row"
          aria-rowindex={1}
          className="csv-grid-header"
          style={{ width: total }}
        >
          <span role="columnheader" className="csv-row-number csv-corner">
            #
          </span>
          {cols.map(({ p, i }) => (
            <div
              role="columnheader"
              aria-colindex={i + 2}
              aria-selected={
                selection.kind === "column" && selection.column === i
              }
              key={i}
              className="csv-column"
              style={{ left: p.left, width: p.width }}
            >
              <button
                title={model.columns[i].name.slice(0, 512)}
                onClick={() => select({ kind: "column", column: i })}
              >
                {model.columns[i].name.slice(0, 100)}
                <small>{model.columns[i].type}</small>
              </button>
              <span
                role="separator"
                aria-label={tr("Resize column {v0}", { v0: i + 1 })}
                aria-orientation="vertical"
                aria-valuenow={p.width}
                aria-valuemin={60}
                aria-valuemax={800}
                tabIndex={0}
                onDoubleClick={() => resize(i, model.columns[i].width)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    resize(i, p.width + (e.key === "ArrowRight" ? 10 : -10));
                  }
                }}
                onPointerDown={(e) => {
                  drag.current = {
                    col: i,
                    x: e.clientX,
                    width: p.width,
                    pointer: e.pointerId,
                  };
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (drag.current?.pointer === e.pointerId)
                    resize(i, drag.current.width + e.clientX - drag.current.x);
                }}
                onPointerUp={() => {
                  drag.current = undefined;
                }}
                onPointerCancel={() => {
                  drag.current = undefined;
                }}
              />
            </div>
          ))}
        </div>
        {Array.from({ length: Math.max(0, end - start) }, (_, n) => {
          const index = start + n,
            row = original(index),
            values = model.rowSource.get(row) ?? [];
          return (
            <div
              role="row"
              aria-rowindex={index + 2}
              key={row}
              className="csv-grid-row"
              style={{
                top: (index + 1) * 32 - view.top * (1 - 1 / scrollScale),
                width: total,
              }}
            >
              <button
                role="rowheader"
                aria-selected={
                  selection.kind === "row" && selection.row === row
                }
                className="csv-row-number"
                onClick={() => select({ kind: "row", row })}
              >
                {row - (header ? 1 : 0) + 1}
              </button>
              {cols.map(({ p, i }) => {
                const value = values[i] ?? "",
                  selected =
                    selection.kind === "cell" &&
                    selection.row === row &&
                    selection.column === i;
                return (
                  <div
                    id={`csv-cell-${row}-${i}`}
                    key={i}
                    role="gridcell"
                    aria-colindex={i + 2}
                    aria-selected={selected}
                    className={`csv-cell ${selected ? "selected" : ""}`}
                    style={{ left: p.left, width: p.width }}
                    onClick={() => cell(row, i)}
                    onDoubleClick={() => {
                      cell(row, i);
                      if (onEditCell) onEditCell(row, i); else inspect();
                    }}
                    title={value.slice(0, 512)}
                  >
                    {value.length > CSV_CONFIG.inspectPreview
                      ? tr("Large value · {v0} characters", { v0: formatNumber(value.length) })
                      : value
                          .slice(0, CSV_CONFIG.cellPreview)
                          .replace(/\r?\n/g, " ↵ ")}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {!count && (
        <p className="csv-empty">
          {model.columns.length ? tr("No data rows") : tr("Empty tabular document")}
        </p>
      )}
    </div>
  );
}
