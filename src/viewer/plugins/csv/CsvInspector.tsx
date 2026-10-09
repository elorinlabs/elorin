import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useCsvModel, type TabularDocumentModel } from "./csv-model";
import { CSV_CONFIG } from "./csv-config";
import { inferValue, typedValue } from "./csv-stats";
import type { CsvSelection } from "./csv-types";
export function CsvInspector({
  model,
  selection,
  header,
}: {
  model: TabularDocumentModel;
  selection: CsvSelection;
  header: boolean;
}) {
  useLocale();
  useCsvModel(model);
  const row =
    selection.kind === "row" || selection.kind === "cell"
      ? model.rowSource.get(selection.row)
      : undefined;
  const stat =
    selection.kind === "column" ? model.stats[selection.column] : undefined;
  const sampled =
    (model.stats[0]?.count ?? 0) < model.rowSource.count - (header ? 1 : 0) ||
    model.status !== "complete";
  const field = (label: string, value: unknown) => (
    <div key={label}>
      <dt>{tr(label)}</dt>
      <dd>{String(value ?? "—").slice(0, 512)}</dd>
    </div>
  );
  return (
    <section aria-label={tr("CSV inspection")} className="csv-inspector">
      <h3>
        {selection.kind === "none"
          ? tr("TABULAR DATA")
          : selection.kind.toUpperCase()}
      </h3>
      <dl>
        {selection.kind === "none" ? (
          <>
            {field(
              "Rows",
              `${formatNumber(Math.max(0, model.rowSource.count - (header ? 1 : 0)))}${model.status === "complete" ? "" : "+"}`,
            )}
            {field("Columns", model.columns.length)}
            {field(
              "Delimiter",
              model.dialect.delimiter === "\t"
                ? "Tab"
                : model.dialect.delimiter === ","
                  ? "Comma"
                  : model.dialect.delimiter,
            )}
            {field("Quote character", model.dialect.quote)}
            {field(
              "Line ending",
              model.dialect.newline === "\r\n"
                ? "CRLF"
                : model.dialect.newline === "\r"
                  ? "CR"
                  : "LF",
            )}
            {field(
              "Header",
              `${header ? "First row" : "Absent"} · heuristic ${(model.dialect.headerConfidence * 100).toFixed(0)}%`,
            )}
            {field("Encoding", model.encoding)}
            {field("Dataset class", model.sizeClass)}
            {field("Ragged rows", model.ragged)}
            {field(
              "Statistics",
              sampled ? "Sampled · loaded prefix" : "Exact · loaded dataset",
            )}
            {field(
              "Missing cells",
              model.stats.reduce((n, s) => n + s.missing, 0),
            )}
          </>
        ) : null}
        {selection.kind === "column" && stat ? (
          <>
            {field("Column", model.columns[selection.column]?.name)}
            {field("Column ID", `col:${selection.column}`)}
            {field("Type", model.columns[selection.column]?.type)}
            {field(
              "Statistics",
              sampled
                ? `Sampled · ${formatNumber(stat.count)} rows`
                : "Exact · loaded dataset",
            )}
            {field("Filled", stat.count - stat.missing)}
            {field(
              "Missing",
              `${stat.missing} (${((stat.missing / (stat.count || 1)) * 100).toFixed(2)}%)`,
            )}
            {field(
              "Unique",
              `${stat.unique}${stat.uniqueLimited ? "+ · limited" : ""}`,
            )}
            {field("Min", stat.min)}
            {field("Max", stat.max)}
            {field(
              "Mean (approximate)",
              stat.mean?.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              }),
            )}
            {field("Numeric values skipped", stat.unsafe)}
            {field("Shortest", stat.shortest)}
            {field("Longest", stat.longest)}
            {field("Average length", stat.averageLength.toFixed(2))}
            {field("TRUE", stat.trueCount)}
            {field("FALSE", stat.falseCount)}
            {field("Earliest", stat.earliest)}
            {field("Latest", stat.latest)}
          </>
        ) : null}
        {selection.kind === "row" && row ? (
          <>
            {field("Row", selection.row - (header ? 1 : 0) + 1)}
            {field("Columns", model.columns.length)}
            {field("Actual fields", row.length)}
            {field("Filled", row.filter((v) => v !== "").length)}
            {field(
              "Missing",
              model.columns.length - row.filter((v) => v !== "").length,
            )}
          </>
        ) : null}
        {selection.kind === "cell" ? (
          <>
            {field("Row", selection.row - (header ? 1 : 0) + 1)}
            {field("Column", model.columns[selection.column]?.name)}
            {field("Column ID", selection.columnId)}
            {field("Type", inferValue(selection.rawValue))}
            {field("Typed interpretation", typedValue(selection.rawValue))}
            {field("Length", selection.rawValue.length)}
            {field(
              "Field",
              row && selection.column >= row.length
                ? "Missing column"
                : selection.rawValue === ""
                  ? "Explicit empty field"
                  : "Present",
            )}
          </>
        ) : null}
      </dl>
      {selection.kind === "cell" && (
        <>
          <h4>{tr("Value")}</h4>
          <pre>{selection.rawValue.slice(0, CSV_CONFIG.inspectPreview)}</pre>
          {selection.rawValue.length > CSV_CONFIG.inspectPreview && (
            <p>
              {tr("Previewing first 32,768 characters. Copy value is available within its size limit.")}</p>
          )}
        </>
      )}
      {selection.kind === "row" && row && (
        <dl>
          {model.columns
            .slice(0, 100)
            .map((c) => field(c.name, (row[c.index] ?? "").slice(0, 512)))}
          {model.columns.length > 100 && <p>{tr("Showing first 100 columns.")}</p>}
        </dl>
      )}
      {model.dialect.fallback && (
        <p>{tr("Delimiter detection was inconclusive; a safe default was used.")}</p>
      )}
      {model.diagnostics.length > 0 && (
        <>
          <h4>{tr("Diagnostics")}</h4>
          <ul>
            {model.diagnostics.map((d, i) => (
              <li key={i}>{tr(d)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
