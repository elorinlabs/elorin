import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import type { DataModel } from './data-model';
import { columnSample } from './sample';
export function ScientificPreview({ model }: { model: DataModel }) {
  useLocale();
  const column = Math.max(0, model.cell?.column ?? 0);
  const sample = columnSample(model.cache.values(), column);
  const first = sample.points[0]?.[0] ?? 0, last = sample.points.at(-1)?.[0] ?? first;
  const span = sample.max! - sample.min!;
  const path = sample.points.map(([row, value], i) => `${i ? 'L' : 'M'}${20 + (row - first) / Math.max(1, last - first) * 560},${130 - (span ? (value - sample.min!) / span : 0.5) * 110}`).join(' ');
  return <section className="data-preview" aria-label={tr("Loaded numeric sample preview")}>
    <p>{tr("Loaded sample only · column")}{' '}{model.selected?.columns?.[column]?.name} {' '}{tr("· rows")}{' '}{first + 1}–{last + 1} · {sample.points.length} {' '}{tr("points ·")}{' '}{sample.skipped} {' '}{tr("omitted · min")}{' '}{sample.min ?? tr("unavailable")} {' '}{tr("/ max")}{' '}{sample.max ?? tr("unavailable")}</p>
    {sample.points.length ? <svg viewBox="0 0 600 150" role="img" aria-label={tr("Line plot of loaded sample")}><path d="M20 10V130H580" fill="none" stroke="currentColor" opacity=".4"/><path d={path} fill="none" stroke="currentColor" strokeWidth="1.5"/></svg> : <p>{tr("No finite, precisely representable numeric values in this loaded column.")}</p>}
  </section>;
}
