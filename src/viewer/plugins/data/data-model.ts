import type { ViewerContext } from "../../core/types";
import type { DataProvider, DataNode, DataPage, DataFilter } from "./types";
import { DATA_LIMITS as L } from "./config";
import { sqliteProvider } from "./sqlite-provider";
import { columnarProvider } from "./columnar-provider";
import { scientificProvider } from "./scientific-provider";
import { pageMemory, scientificCache } from './cache-budget';
import { scientificError } from './errors';
export class DataModel {
  nodes: DataNode[] = [];
  selected?: DataNode;
  error = "";
  busy = false;
  provider?: DataProvider;
  private listeners = new Set<() => void>();
  private revision = 0;
  private generation = 0;
  private closed = false;
  private paused = false;
  private opening = 0;
  private inFlight = new Map<string, Promise<void>>();
  private latest?: { start: number; columns: number[]; generation: number };
  cache = new Map<string, DataPage>();
  fixed: number[] = [];
  filter?: DataFilter;
  columnsWindow: number[] = [];
  count?: number;
  position = 0;
  cell?: { row: number; column: number };
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = () => this.revision;
  emit() {
    if (this.closed) return;
    this.revision++;
    for (const f of this.listeners) f();
  }
  constructor(
    readonly context: ViewerContext,
    readonly family: "database" | "columnar" | "scientific",
  ) {
    context.onCleanup(() => {
      this.closed = true;
      this.generation++;
      this.clearCache();
      this.provider?.close();
      this.listeners.clear();
    });
  }
  async open() {
    const opening = ++this.opening;
    this.busy = true;
    this.emit();
    try {
      const provider = await (
        this.family === "database"
          ? sqliteProvider
          : this.family === "columnar"
            ? columnarProvider
            : scientificProvider
      )(this.context);
      if (this.closed || this.paused || opening !== this.opening) {
        provider.close();
        return;
      }
      this.provider = provider;
      this.nodes = await provider.nodes();
      if (this.closed) return;
      const first = this.nodes.find((n) =>
        ["table", "variable", "dataset"].includes(n.kind),
      );
      if (first) await this.select(first.id);
    } catch (e) {
      if (!this.closed && opening === this.opening) this.error = scientificError(e);
    } finally {
      if (opening === this.opening) { this.busy = false; this.emit(); }
    }
  }
  async select(id: string) {
    const gen = ++this.generation;
    this.busy = true;
    this.error = "";
    this.clearCache();
    this.selected = undefined;
    this.fixed = [];
    this.position = 0;
    this.cell = undefined;
    this.filter = undefined;
    this.emit();
    try {
      const selected = await this.provider!.describe(id);
      if (this.closed || gen !== this.generation) return;
      this.selected = selected;
      this.count = selected.rows;
      if (selected.shape) {
        const count = selected.shape.length >= 2 ? selected.shape.at(-1)! : 1;
        selected.columns = Array.from(
          { length: Math.min(count, 4096) },
          (_, i) => ({
            name: selected.shape!.length >= 2 ? String(i) : "Value",
            type: String(selected.metadata.dtype ?? "unknown"),
          }),
        );
        selected.metadata.logicalColumns = count;
        if (count > 4096)
          selected.metadata.columnLimit =
            "Grid displays first 4096 columns; source shape preserved";
      }
      this.columnsWindow = Array.from(
        { length: Math.min(selected.columns?.length ?? 0, L.pageColumns) },
        (_, i) => i,
      );
      if (["table", "view", "dataset", "variable"].includes(selected.kind))
        await this.page(0, this.columnsWindow, gen);
    } catch (e) {
      if (gen === this.generation && !this.closed)
        this.error = scientificError(e);
    } finally {
      if (gen === this.generation) {
        this.busy = false;
        this.emit();
      }
    }
  }
  async expand(id: string) {
    try {
      const children = await this.provider!.children!(id);
      if (this.closed) return;
      const index = this.nodes.findIndex((n) => n.id === id);
      this.nodes = this.nodes.filter((n) => !n.id.startsWith(id + "/"));
      this.nodes.splice(index + 1, 0, ...children);
      if (this.nodes.length > L.nodes) { this.nodes.splice(index + 1, children.length); throw Error('ResourceLimit: expanded tree nodes'); }
      this.emit();
    } catch (e) {
      this.error = scientificError(e);
      this.emit();
    }
  }
  private key(start: number, columns: number[]) {
    return `${start}:${columns.join(",")}`;
  }
  getCell(row: number, col: number) {
    for (const p of this.cache.values()) {
      const i = p.columns.indexOf(col);
      if (i >= 0 && row >= p.start && row < p.start + p.values.length)
        return p.values[row - p.start][i];
    }
    return undefined;
  }
  async page(
    start: number,
    columns = this.columnsWindow,
    gen = this.generation,
  ) {
    if (this.paused || !this.selected || !columns.length) return;
    if (this.count !== undefined && start >= this.count) return;
    const pageStart = Math.floor(start / L.pageRows) * L.pageRows;
    if (
      this.family !== "database" &&
      this.filter &&
      !columns.includes(this.filter.column)
    )
      columns = [this.filter.column, ...columns.slice(0, L.pageColumns - 1)];
    const key = this.key(pageStart, columns);
    if (this.cache.has(key)) return;
    const previous = [...this.cache.values()].find(
        (p) => p.start + p.values.length === pageStart && p.cursor,
      ),
      cursor = previous?.cursor;
    const nodeId = this.selected.id;
    const p = await this.provider!.read({
      node: this.selected.id,
      start: pageStart,
      count: L.pageRows,
      columns,
      fixed: this.fixed,
      filter: this.filter,
      cursor,
    });
    if (this.closed || gen !== this.generation || this.selected?.id !== nodeId)
      return;
    const old = this.cache.get(key); if (old) scientificCache.remove(old);
    this.cache.set(key, p);
    scientificCache.add(p, pageMemory(p), () => { this.cache.delete(key); });
    while (this.cache.size > L.cachePages)
      this.evictFirst();
    const bytes = (page: DataPage) =>
      page.values.reduce(
        (sum, row) =>
          sum +
          row.reduce(
            (s, c) => s + (c.raw.length + c.display.length) * 2 + 256,
            0,
          ),
        0,
      );
    while (
      this.cache.size > 0 &&
      [...this.cache.values()].reduce((n, p) => n + bytes(p), 0) > L.cacheBytes
    )
      this.evictFirst();
    if (!p.hasMore) this.count = p.start + p.values.length;
    else if (p.rows !== undefined) this.count = p.rows;
    this.emit();
  }
  async request(start: number, columns: number[]) {
    if (this.paused) return;
    const gen = this.generation;
    const key = `${gen}:${Math.floor(start / L.pageRows)}:${columns.join(',')}`;
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    if (this.inFlight.size >= 2) { this.latest = { start, columns: [...columns], generation: gen }; return; }
    const work = this.runRequest(start, columns, gen).finally(() => {
      this.inFlight.delete(key);
      const latest = this.latest; this.latest = undefined;
      if (latest && latest.generation === this.generation && !this.closed && !this.paused) void this.request(latest.start, latest.columns);
    });
    this.inFlight.set(key, work);
    return work;
  }
  private async runRequest(start: number, columns: number[], gen: number) {
    try {
      await this.page(start, columns);
    } catch (e) {
      if (this.closed || gen !== this.generation) return;
      this.error = scientificError(e);
      this.emit();
    }
  }
  async reset() {
    this.generation++;
    this.clearCache();
    this.count = this.filter ? undefined : this.selected?.rows;
    this.emit();
    await this.request(0, this.columnsWindow);
  }
  private evictFirst() {
    const key = this.cache.keys().next().value;
    if (key !== undefined) { scientificCache.remove(this.cache.get(key)!); this.cache.delete(key); }
  }
  private clearCache() { for (const p of this.cache.values()) scientificCache.remove(p); this.cache.clear(); }
  setActive(active: boolean) {
    if (this.closed || this.paused === !active) return;
    this.paused = !active;
    this.generation++; this.opening++;
    this.latest = undefined; this.inFlight.clear(); this.clearCache(); this.provider?.close(); this.provider = undefined;
    if (active) void this.open();
    else { this.busy = false; this.emit(); }
  }
  async calculateCount() {
    const gen = this.generation;
    this.busy = true;
    this.emit();
    try {
      const n = await this.provider!.count!(this.selected!.id);
      if (gen === this.generation && !this.closed) {
        if (!this.filter) this.count = n;
        this.selected!.metadata.exactUnfilteredRows = n;
      }
    } catch (e) {
      this.error = scientificError(e);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
}
