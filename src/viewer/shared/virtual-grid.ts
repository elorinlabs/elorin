/** Generic windowing primitives shared by CSV and sparse workbook grids. */
export function visibleRange(
  top: number,
  height: number,
  rowHeight: number,
  count: number,
  overscan = 6,
) {
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan);
  return {
    start,
    end: Math.min(count, start + Math.ceil(height / rowHeight) + overscan * 2),
  };
}
export function intersectsViewport(
  left: number,
  width: number,
  viewLeft: number,
  viewWidth: number,
  overscan = 250,
) {
  return (
    left + width >= viewLeft - overscan &&
    left <= viewLeft + viewWidth + overscan
  );
}
export type GridSelection = {
  kind: "cell" | "row" | "column";
  row: number;
  column: number;
};
/** Sparse axes have O(overrides), never O(logical rows), storage. */
export class SparseAxis {
  private changes: { index: number; size: number; delta: number }[];
  constructor(
    readonly count: number,
    readonly defaultSize: number,
    overrides: Map<number, number> = new Map(),
  ) {
    let delta = 0;
    this.changes = [...overrides]
      .filter(([i]) => i >= 0 && i < count)
      .sort((a, b) => a[0] - b[0])
      .map(([index, size]) => {
        const c = { index, size, delta };
        delta += size - defaultSize;
        return c;
      });
  }
  size(index: number) {
    return (
      this.changes.find((c) => c.index === index)?.size ?? this.defaultSize
    );
  }
  offset(index: number) {
    let lo = 0,
      hi = this.changes.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (this.changes[m].index < index) lo = m + 1;
      else hi = m;
    }
    const p = this.changes[lo - 1];
    return (
      index * this.defaultSize + (p ? p.delta + p.size - this.defaultSize : 0)
    );
  }
  get total() {
    return this.offset(this.count);
  }
  at(pixel: number) {
    let lo = 0,
      hi = this.count;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (this.offset(m + 1) <= pixel) lo = m + 1;
      else hi = m;
    }
    return Math.min(this.count - 1, lo);
  }
  window(pixel: number, extent: number) {
    const items: number[] = [];
    for (
      let i = Math.max(0, this.at(pixel) - 2);
      i < this.count && this.offset(i) < pixel + extent + 200;
      i++
    )
      if (this.size(i) > 0) items.push(i);
    return items;
  }
}
