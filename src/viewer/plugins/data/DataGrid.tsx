import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useCallback, useSyncExternalStore, useState } from "react";
import { GridSurface } from "../../shared/GridSurface";
import type { CsvSelection } from "../csv/csv-types";
import type { DataModel } from "./data-model";
import { DATA_LIMITS as L } from "./config";
import "../csv/csv.css";
export function DataGrid({
  model,
  inspect,
}: {
  model: DataModel;
  inspect: () => void;
}) {
  useLocale();
  useSyncExternalStore(model.subscribe, model.snapshot);
  const [selection, select] = useState<CsvSelection>({ kind: "none" }),
    [widths, setWidths] = useState<Record<string, number>>({}),
    [navigation, setNavigation] = useState(0);
  const request = useCallback(
    (start: number, end: number, columns: number[]) => {
      const cols = columns.slice(0, L.pageColumns);
      model.columnsWindow = cols;
      void model.request(start, cols);
      if (
        Math.floor(start / L.pageRows) !==
        Math.floor(Math.max(start, end - 1) / L.pageRows)
      )
        void model.request(Math.max(start, end - 1), cols);
    },
    [model, model.selected?.id, model.filter, model.fixed],
  );
  const selected = model.selected;
  const filter = model.family !== "database" ? model.filter : undefined;
  const sampleRows = filter
    ? [
        ...new Set(
          [...model.cache.values()].flatMap((p) =>
            p.values.map((_, i) => p.start + i),
          ),
        ),
      ]
        .sort((a, b) => a - b)
        .filter((row) => {
          const c = model.getCell(row, filter.column);
          if (!c) return false;
          if (filter.op === "null") return c.type === "null";
          if (filter.op === "contains") return c.raw.includes(filter.value);
          if (filter.op === "equals") return c.raw === filter.value;
          if (/^-?\d+$/.test(c.raw) && /^-?\d+$/.test(filter.value))
            return filter.op === "greater"
              ? BigInt(c.raw) > BigInt(filter.value)
              : BigInt(c.raw) < BigInt(filter.value);
          if (!/float|real|double/.test(c.type)) return false;
          return filter.op === "greater"
            ? Number(c.raw) > Number(filter.value)
            : Number(c.raw) < Number(filter.value);
        })
    : undefined;
  const source = {
    columns: (selected?.columns ?? []).map((c, i) => ({
      id: `col:${i}`,
      name: c.name,
      width: 160,
      type: c.type,
    })),
    rowSource: {
      count:
        model.count ??
        Math.max(
          L.pageRows,
          model.position + L.pageRows * 2,
          ...[...model.cache.values()].map(
            (p) => p.start + p.values.length + (p.hasMore ? L.pageRows : 0),
          ),
        ),
      get: (row: number) =>
        source.columns.map((_, col) => model.getCell(row, col)?.display ?? "…"),
    },
  };
  return (
    <GridSurface
      key={selected?.id}
      label={tr("Read-only data grid")}
      model={source}
      rows={sampleRows}
      header={false}
      selection={selection}
      select={(s) => {
        select(s);
        if (s.kind === "cell") model.cell = { row: s.row, column: s.column };
        else if (s.kind === "column")
          model.cell = { row: -1, column: s.column };
        else if (s.kind === "row") model.cell = { row: s.row, column: -1 };
        else model.cell = undefined;
        model.emit();
        setNavigation((n) => n + 1);
      }}
      widths={widths}
      resize={(col, width) =>
        setWidths((w) => ({
          ...w,
          [`col:${col}`]: Math.max(80, Math.min(600, width)),
        }))
      }
      scroll={{ top: model.position * 32, left: 0 }}
      saveScroll={(top) => {
        model.position = Math.floor(top / 32);
      }}
      navigation={navigation}
      inspect={inspect}
      onWindow={filter ? undefined : request}
    />
  );
}
