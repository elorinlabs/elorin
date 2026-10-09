import * as SSF from "ssf";
import { scanOfficeXml } from "../office/xml-stream";
import { safeXml } from "../office/package";
import type { CSSProperties } from "react";
import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import {
  OfficePackage,
  loadOfficePackage,
  descendants as all,
  firstElement as first,
  attribute as a,
  childElements as children,
} from "../office/OfficePackage";
export const MAX_ROWS = 1048576,
  MAX_COLS = 16384;
export function columnName(col: number) {
  let s = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function address(row: number, col: number) {
  return `${columnName(col)}${row + 1}`;
}
export function coordinate(s: string): [number, number] | undefined {
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/i.exec(s);
  if (!m) return;
  let c = 0;
  for (const l of m[1].toUpperCase()) c = c * 26 + l.charCodeAt(0) - 64;
  const r = Number(m[2]);
  if (r <= MAX_ROWS && c <= MAX_COLS) return [r - 1, c - 1];
}
export interface Cell {
  address: string;
  row: number;
  column: number;
  raw: string;
  display: string;
  type: string;
  formula?: string;
  style: CSSProperties;
  numFmt: string;
  comment?: string;
  link?: string;
}
export interface Merge {
  row: number;
  column: number;
  endRow: number;
  endColumn: number;
}
export interface Sheet {
  name: string;
  path: string;
  state: string;
  cells: Map<string, Cell>;
  rows: number;
  columns: number;
  usedRange: string;
  merges: Merge[];
  rowSizes: Map<number, number>;
  colSizes: Map<number, number>;
  freezeRows: number;
  freezeCols: number;
  conditionalFormats: number;
  charts: { label: string; detail: string }[];
  images: string[];
  formulas: number;
  hiddenRows: number;
  hiddenCols: number;
  loaded: boolean;
}
interface CellStyle {
  css: CSSProperties;
  numFmt: string;
}
export interface Workbook {
  pkg?: OfficePackage;
  sheets: Sheet[];
  names: { name: string; value: string }[];
  date1904: boolean;
  styles: CellStyle[];
  strings: string[];
  externalLinks: number;
  connections: number;
  pivots: number;
  error?: string;
  limited?: string;
  warnings: string[];
  initial: number;
  cache: Map<number, Sheet>;
}
const text = (e: Document | Element, name: string) =>
  all(e, name)
    .map((n) => n.textContent ?? "")
    .join("");
const hex = (v: string | undefined) =>
  v && /^[\da-f]{6,8}$/i.test(v) ? `#${v.slice(-6)}` : undefined;
function styleTable(pkg: OfficePackage): CellStyle[] {
  const doc = pkg.xml("xl/styles.xml");
  if (!doc) return [{ css: {}, numFmt: "General" }];
  const formats = new Map(
    all(doc, "numFmt").map((n) => [
      Number(a(n, "numFmtId")),
      a(n, "formatCode") ?? "General",
    ]),
  );
  const fonts = first(doc, "fonts")?.children ?? [],
    fills = first(doc, "fills")?.children ?? [],
    borders = first(doc, "borders")?.children ?? [];
  return Array.from(first(doc, "cellXfs")?.children ?? []).map((x) => {
    const f = fonts[Number(a(x, "fontId"))],
      fill = fills[Number(a(x, "fillId"))],
      border = borders[Number(a(x, "borderId"))],
      align = first(x, "alignment");
    const css: CSSProperties = {
      fontWeight: f && first(f, "b") ? "bold" : undefined,
      fontStyle: f && first(f, "i") ? "italic" : undefined,
      color: f ? hex(a(first(f, "color"), "rgb")) : undefined,
      backgroundColor: fill ? hex(a(first(fill, "fgColor"), "rgb")) : undefined,
      textAlign: a(align, "horizontal") as CSSProperties["textAlign"],
      whiteSpace: a(align, "wrapText") === "1" ? "pre-wrap" : "nowrap",
    };
    if (border)
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const b = children(border, side)[0];
        if (a(b, "style"))
          css[`border${side[0].toUpperCase() + side.slice(1)}` as "borderTop"] =
            `1px solid ${hex(a(b && first(b, "color"), "rgb")) ?? "#888"}`;
      }
    const id = Number(a(x, "numFmtId"));
    return { css, numFmt: formats.get(id) ?? SSF.get_table()[id] ?? "General" };
  });
}
function blankSheet(name: string, path: string, state = "visible"): Sheet {
  return {
    name,
    path,
    state,
    cells: new Map(),
    rows: 1,
    columns: 1,
    usedRange: "A1",
    merges: [],
    rowSizes: new Map(),
    colSizes: new Map(),
    freezeRows: 0,
    freezeCols: 0,
    conditionalFormats: 0,
    charts: [],
    images: [],
    formulas: 0,
    hiddenRows: 0,
    hiddenCols: 0,
    loaded: false,
  };
}
export async function loadWorkbook(context: ViewerContext): Promise<Workbook> {
  const m: Workbook = {
    sheets: [],
    names: [],
    date1904: false,
    styles: [],
    strings: [],
    externalLinks: 0,
    connections: 0,
    pivots: 0,
    warnings: [],
    initial: 0,
    cache: new Map(),
  };
  if (["xls", "xlsb"].includes(context.file.extension ?? "")) {
    m.limited =
      "Limited Preview — legacy binary worksheets are not decoded. Open externally for full fidelity.";
    return m;
  }
  try {
    m.pkg = await loadOfficePackage(context);
    context.onCleanup(() => {
      for (const s of m.sheets) {
        s.cells.clear();
        s.images = [];
        s.charts = [];
      }
      m.cache.clear();
      m.strings = [];
      m.styles = [];
    });
    const pkg = m.pkg;
    m.externalLinks = [...pkg.entries.keys()].filter((n) =>
      /^xl\/externalLinks\/externalLink\d+\.xml$/.test(n),
    ).length;
    m.connections = all(
      pkg.xml("xl/connections.xml") ??
        new DOMParser().parseFromString("<x/>", "application/xml"),
      "connection",
    ).length;
    m.pivots = [...pkg.entries.keys()].filter((n) =>
      /pivotTables\/pivotTable\d+\.xml$/.test(n),
    ).length;
    if (
      context.file.extension === "ods" ||
      (pkg.entries.has("META-INF/manifest.xml") &&
        !pkg.entries.has("xl/workbook.xml"))
    ) {
      const d = pkg.xml("content.xml");
      if (!d) throw Error("OpenDocument workbook content is missing.");
      m.sheets = all(d, "table")
        .filter((n) => a(n, "name"))
        .map((n, i) => blankSheet(a(n, "name")!, `ods:${i}`));
    } else {
      const d = pkg.xml("xl/workbook.xml");
      if (!d) throw Error("Workbook content is missing.");
      const rels = pkg.relationships("xl/workbook.xml");
      m.date1904 = ["1", "true"].includes(
        a(first(d, "workbookPr"), "date1904") ?? "",
      );
      m.styles = styleTable(pkg);
      const ss = pkg.xml("xl/sharedStrings.xml");
      if (ss) m.strings = all(ss, "si").map((n) => text(n, "t"));
      m.sheets = all(d, "sheet").map((n) => {
        const rel = rels.get(a(n, "id") ?? "");
        if (!rel || rel.external)
          throw Error("Unsafe or missing worksheet relationship.");
        return blankSheet(
          a(n, "name") ?? "Sheet",
          rel.target,
          a(n, "state") ?? "visible",
        );
      });
      m.names = all(d, "definedName").map((n) => ({
        name: a(n, "name") ?? "",
        value: n.textContent ?? "",
      }));
      m.initial = Math.min(
        m.sheets.length - 1,
        Math.max(0, Number(a(first(d, "workbookView"), "activeTab")) || 0),
      );
    }
    if (!m.sheets.length) throw Error("Workbook has no sheets.");
    if (m.sheets[m.initial].state !== "visible")
      m.initial = Math.max(
        0,
        m.sheets.findIndex((s) => s.state === "visible"),
      );
    await loadSheet(m, m.initial, context.signal);
  } catch (e) {
    checkAbort(context.signal);
    m.error = e instanceof Error ? e.message : "Workbook preview unavailable.";
  }
  return m;
}
function makeCell(
  m: Workbook,
  row: number,
  col: number,
  raw: string,
  type: string,
  formula: string | undefined,
  styleIndex: number,
): Cell {
  const style = m.styles[styleIndex] ?? { css: {}, numFmt: "General" };
  let display = raw;
  if (type === "s") display = m.strings[Number(raw)] ?? "";
  else if (type === "b") display = raw === "1" ? "TRUE" : "FALSE";
  else if ((type === "n" || !type) && raw !== "")
    try {
      display = SSF.format(style.numFmt, Number(raw), { date1904: m.date1904 });
    } catch {
      display = raw;
    }
  if (formula !== undefined && raw === "") display = "Result unavailable";
  return {
    address: address(row, col),
    row,
    column: col,
    raw,
    display,
    type: type || "n",
    formula,
    style: style.css,
    numFmt: style.numFmt,
  };
}
export async function loadSheet(
  m: Workbook,
  index: number,
  signal: AbortSignal,
): Promise<Sheet> {
  checkAbort(signal);
  const s = m.sheets[index];
  if (!s) throw Error("Unknown worksheet.");
  if (s.loaded) {
    m.cache.delete(index);
    m.cache.set(index, s);
    return s;
  }
  const pkg = m.pkg!;
  if (s.path.startsWith("ods:")) {
    const doc = pkg.xml("content.xml");
    if (!doc) throw Error("Worksheet XML is missing.");
    parseOds(
      m,
      s,
      all(doc, "table").filter((n) => a(n, "name"))[Number(s.path.slice(4))],
    );
  } else {
    const bytes = pkg.entries.get(s.path);
    if (!bytes) throw Error("Worksheet XML is missing.");
    const doc = await streamSheet(m, s, bytes, signal);
    for (const n of all(doc, "mergeCell")) {
      const [p, q] = (a(n, "ref") ?? "").split(":").map(coordinate);
      if (p && q)
        s.merges.push({
          row: p[0],
          column: p[1],
          endRow: q[0],
          endColumn: q[1],
        });
    }
    for (const n of all(doc, "col")) {
      const lo = Math.max(0, Number(a(n, "min")) - 1),
        hi = Math.min(MAX_COLS, Number(a(n, "max")));
      for (let i = lo; i < hi; i++) {
        const hidden = a(n, "hidden") === "1";
        if (hidden) s.hiddenCols++;
        s.colSizes.set(
          i,
          hidden
            ? 0
            : Math.max(
                40,
                Math.min(500, (Number(a(n, "width")) || 12) * 7 + 5),
              ),
        );
      }
    }
    const pane = first(doc, "pane");
    if (["frozen", "frozenSplit"].includes(a(pane, "state") ?? "")) {
      s.freezeRows = Math.min(100, Number(a(pane, "ySplit")) || 0);
      s.freezeCols = Math.min(20, Number(a(pane, "xSplit")) || 0);
    }
    s.conditionalFormats = all(doc, "cfRule").length;
    const rels = pkg.relationships(s.path);
    for (const n of all(doc, "hyperlink")) {
      const c = s.cells.get(a(n, "ref") ?? "");
      if (c) {
        const rel = rels.get(a(n, "id") ?? "");
        c.link = a(n, "location")
          ? `#${a(n, "location")}`
          : rel?.external
            ? rel.target
            : undefined;
      }
    }
    for (const rel of rels.values()) {
      if (rel.external) continue;
      if (rel.type === "comments") {
        const d = pkg.xml(rel.target);
        if (d) {
          const authors = all(d, "author").map((n) => n.textContent ?? "");
          for (const c of all(d, "comment")) {
            const key = a(c, "ref") ?? "";
            let cell = s.cells.get(key);
            const xy = coordinate(key);
            if (!cell && xy) {
              cell = makeCell(m, ...xy, "", "str", undefined, 0);
              s.cells.set(key, cell);
            }
            if (cell)
              cell.comment = `${authors[Number(a(c, "authorId"))] ?? ""}: ${text(c, "t")}`;
          }
        }
      }
      if (rel.type === "drawing") {
        const d = pkg.xml(rel.target),
          dr = pkg.relationships(rel.target);
        if (d)
          for (const r of dr.values())
            if (!r.external) {
              if (r.type === "image") s.images.push(r.target);
              if (r.type === "chart") {
                const ch = pkg.xml(r.target);
                s.charts.push({
                  label: ch ? text(ch, "v").slice(0, 160) || "Chart" : "Chart",
                  detail: ch
                    ? `${all(ch, "ser").length} series • ${Array.from(ch.getElementsByTagName("*")).find((n) => /Chart$/.test(n.localName))?.localName ?? "Chart"}`
                    : "Chart",
                });
              }
            }
      }
    }
  }
  s.usedRange = `A1:${address(s.rows - 1, s.columns - 1)}`;
  s.loaded = true;
  m.cache.set(index, s);
  // At most three parsed sheets, and at most 200k cached cells apart from the active sheet.
  let cached = [...m.cache].reduce(
    (v, [i, x]) => v + (i === index ? 0 : x.cells.size),
    0,
  );
  for (const [i, old] of m.cache) {
    if (i === index) continue;
    if (m.cache.size <= 3 && cached <= 200000) break;
    cached -= old.cells.size;
    old.cells.clear();
    old.loaded = false;
    old.merges = [];
    old.rowSizes.clear();
    old.colSizes.clear();
    old.images = [];
    old.charts = [];
    old.formulas = 0;
    old.hiddenRows = 0;
    old.hiddenCols = 0;
    m.cache.delete(i);
  }
  return s;
}
function parseOds(m: Workbook, s: Sheet, table: Element) {
  let row = 0;
  for (const r of all(table, "table-row")) {
    const repeat = Math.min(
      MAX_ROWS - row,
      Number(a(r, "number-rows-repeated")) || 1,
    );
    let col = 0;
    for (const n of Array.from(r.children).filter((n) =>
      ["table-cell", "covered-table-cell"].includes(n.localName),
    )) {
      const count = Math.min(
          MAX_COLS - col,
          Number(a(n, "number-columns-repeated")) || 1,
        ),
        type = a(n, "value-type") ?? "string",
        formula = a(n, "formula");
      const raw =
        a(n, "value") ??
        a(n, "boolean-value") ??
        a(n, "date-value") ??
        a(n, "time-value") ??
        text(n, "p");
      if (raw || formula) {
        if (repeat * count + s.cells.size > 200000)
          throw Error(
            "Repeated ODS cells exceed the 200,000 cell preview budget.",
          );
        for (let rr = 0; rr < repeat; rr++)
          for (let cc = 0; cc < count; cc++) {
            const c = makeCell(
              m,
              row + rr,
              col + cc,
              raw,
              type === "float" ? "n" : type === "boolean" ? "b" : "str",
              formula,
              0,
            );
            if (type === "boolean") c.display = raw.toUpperCase();
            s.cells.set(c.address, c);
            if (formula) s.formulas++;
          }
        s.rows = Math.max(s.rows, row + repeat);
        s.columns = Math.max(s.columns, col + count);
      }
      const nr = Number(a(n, "number-rows-spanned")) || 1,
        nc = Number(a(n, "number-columns-spanned")) || 1;
      if (nr > 1 || nc > 1)
        s.merges.push({
          row,
          column: col,
          endRow: Math.min(MAX_ROWS - 1, row + nr - 1),
          endColumn: Math.min(MAX_COLS - 1, col + nc - 1),
        });
      col += count;
    }
    row += repeat;
    if (row >= MAX_ROWS) break;
  }
}

async function streamSheet(
  m: Workbook,
  s: Sheet,
  bytes: Uint8Array,
  signal: AbortSignal,
) {
  let inData = false,
    cell:
      | {
          key: string;
          type: string;
          style: number;
          raw: string;
          formula?: string;
        }
      | undefined,
    field = "",
    meta = "",
    metaSize = 0;
  const escape = (v: string) =>
    v
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const append = (v: string) => {
    metaSize += v.length;
    if (metaSize > 8 * 1024 * 1024)
      throw Error("Worksheet metadata exceeds the preview budget.");
    meta += v;
  };
  await scanOfficeXml(bytes, signal, {
    open(tag) {
      const attrs = Object.fromEntries(
        Object.values(tag.attributes).map((x) => [x.local, x.value]),
      );
      if (tag.local === "sheetData") {
        inData = true;
        return;
      }
      if (!inData) {
        append(
          `<${tag.name}${Object.values(tag.attributes)
            .map((x) => ` ${x.name}="${escape(x.value)}"`)
            .join("")}>`,
        );
        return;
      }
      if (tag.local === "row") {
        const i = Number(attrs.r) - 1;
        if (i >= 0 && i < MAX_ROWS) {
          const hidden = attrs.hidden === "1";
          if (hidden) s.hiddenRows++;
          if (hidden || attrs.ht)
            s.rowSizes.set(
              i,
              hidden
                ? 0
                : Math.max(16, Math.min(160, (Number(attrs.ht) * 96) / 72)),
            );
        }
      }
      if (tag.local === "c") {
        cell = {
          key: attrs.r ?? "",
          type: attrs.t ?? "n",
          style: Number(attrs.s) || 0,
          raw: "",
        };
        if (s.cells.size >= MAX_ROWS * 2)
          throw Error("Worksheet exceeds the two million stored cell budget.");
      }
      if (cell && ["v", "t", "f"].includes(tag.local)) {
        field = tag.local;
        if (field === "f") cell.formula = "";
      }
    },
    text(t) {
      if (!inData) {
        append(escape(t));
        return;
      }
      if (cell) {
        if (field === "f") cell.formula = (cell.formula ?? "") + t;
        else if (field === "v" || field === "t") cell.raw += t;
        if (cell.raw.length > 1048576 || (cell.formula?.length ?? 0) > 65536)
          throw Error("Cell text exceeds the preview budget.");
      }
    },
    close(tag) {
      if (tag.local === "sheetData") {
        inData = false;
        return;
      }
      if (!inData) {
        append(`</${tag.name}>`);
        return;
      }
      if (tag.local === field) field = "";
      if (tag.local === "c" && cell) {
        const xy = coordinate(cell.key);
        if (xy) {
          const c = makeCell(
            m,
            ...xy,
            cell.raw,
            cell.type,
            cell.formula,
            cell.style,
          );
          s.cells.set(c.address, c);
          s.rows = Math.max(s.rows, xy[0] + 1);
          s.columns = Math.max(s.columns, xy[1] + 1);
          if (c.formula !== undefined) s.formulas++;
        }
        cell = undefined;
      }
    },
  });
  return safeXml(new TextEncoder().encode(meta));
}
