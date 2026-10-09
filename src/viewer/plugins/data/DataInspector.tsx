import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useSyncExternalStore } from "react";
import type { DataModel } from "./data-model";
import { boundedValue, blobMagic } from "./precision";
import { TextLine } from "../text/TextLine";
export function DataInspector({ model }: { model: DataModel }) {
  useLocale();
  useSyncExternalStore(model.subscribe, model.snapshot);
  const node = model.selected,
    selection = model.cell,
    cell =
      selection && selection.row >= 0 && selection.column >= 0
        ? model.getCell(selection.row, selection.column)
        : undefined,
    column =
      selection && selection.column >= 0
        ? node?.columns?.[selection.column]
        : undefined;
  return (
    <div className="data-inspector">
      <h3>{cell ? tr("Cell") : column ? tr("Column") : tr("Schema / Dataset")}</h3>
      {cell && (
        <dl>
          <dt>{tr("Logical row")}</dt>
          <dd>{selection!.row + 1}</dd>
          <dt>{tr("Column")}</dt>
          <dd>{column?.name}</dd>
          <dt>{tr("Declared / source type")}</dt>
          <dd>{column?.type}</dd>
          <dt>{tr("Storage type")}</dt>
          <dd>{cell.type}</dd>
          {(cell.type === "blob" || cell.type === "binary") && (
            <>
              <dt>{tr("Magic preview")}</dt>
              <dd>{blobMagic(cell.raw)}</dd>
            </>
          )}
          <dt>{tr("Size")}</dt>
          <dd>{cell.size ?? "—"} {' '}{tr("bytes")}</dd>
          <dt>{tr("Raw value")}</dt>
          <dd>
            <pre>{cell.type === "null" ? tr("NULL") : cell.raw}</pre>
          </dd>
          {cell.truncated && (
            <>
              <dt>{tr("Preview")}</dt>
              <dd>{tr("Truncated; copying returns this bounded preview")}</dd>
            </>
          )}
          <dt>{tr("Details")}</dt>
          <dd>
            <pre>{JSON.stringify(cell.details, null, 2)}</pre>
          </dd>
        </dl>
      )}
      {column && (
        <>
          <h4>
            {column.name} · {column.type}
          </h4>
          <pre>{JSON.stringify(boundedValue(column.metadata), null, 2)}</pre>
        </>
      )}
      {node && (
        <>
          <h4>{node.name}</h4>
          <p>{node.shape?.join(" × ")}</p>
          <p>
            {tr("Rows:")}{model.count === undefined ? tr("Unknown · count on demand") : formatNumber(model.count)}
          </p>
          {typeof node.metadata.sql === "string" && (
            <pre aria-label={tr("Read-only schema SQL")}>
              <TextLine
                text={node.metadata.sql}
                profile="Code"
                language="sql"
                highlighting
              />
            </pre>
          )}
          <pre>{JSON.stringify(boundedValue(node.metadata), null, 2)}</pre>
          <h4>{tr("Columns / Schema")}</h4>
          {node.columns?.slice(0, 128).map((c, i) => (
            <p key={i}>
              {c.name} · {c.type} {c.nullable ? tr("· nullable") : ""}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
