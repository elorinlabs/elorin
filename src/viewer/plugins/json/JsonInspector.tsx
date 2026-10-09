import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useState } from "react";
import type { JsonDocumentModel } from "./json-model";
import { JSON_CONFIG } from "./json-config";
import { valueText } from "./json-parser";
export function JsonInspector({
  model,
  selected,
}: {
  model: JsonDocumentModel;
  selected: number;
}) {
  useLocale();
  const [full, setFull] = useState(false),
    node = model.nodes[selected];
  const stats = model.stats;
  return (
    <div className="json-inspector" aria-label={tr("JSON inspection")}>
      <p className="json-eyebrow">{tr("JSON DOCUMENT")}</p>
      <dl>
        <dt>{tr("Root type")}</dt>
        <dd>{model.nodes[0]?.type ?? tr("Unavailable")}</dd>
        <dt>{tr("Nodes")}</dt>
        <dd>{formatNumber(stats.nodes)}</dd>
        {(
          ["object", "array", "string", "number", "boolean", "null"] as const
        ).map((type) => (
          <div className="json-stat" key={type}>
            <dt>{tr(type)}</dt>
            <dd>{formatNumber(stats[type])}</dd>
          </div>
        ))}
        <dt>{tr("Max depth")}</dt>
        <dd>{stats.maxDepth}</dd>
        <dt>{tr("Duplicate keys")}</dt>
        <dd>{stats.duplicateKeys}</dd>
      </dl>
      <p className="json-note">
        {tr("Root depth is 0. Numbers are displayed and copied from their exact source tokens.")}</p>
      {!!stats.precisionRisks && (
        <p className="json-note">
          {stats.precisionRisks} {tr("numbers exceed safe integer/range conversion; original precision is retained.")}</p>
      )}
      {model.nodes[0]?.type === "object" && (
        <section>
          <h3>{tr("Top-level keys")}</h3>
          <p className="json-top-keys">
            {model.nodes[0]
              .children!.slice(0, 30)
              .map((index) => model.nodes[index].key.slice(0, 240))
              .join(", ")}
            {model.nodes[0].children!.length > 30 ? ", …" : ""}
          </p>
        </section>
      )}
      {node && (
        <section className="json-node-inspection" key={node.id}>
          <p className="json-eyebrow">{tr("SELECTED")}{' '}{node.type.toUpperCase()}</p>
          <dl>
            <dt>{tr("Pointer")}</dt>
            <dd dir="auto">{node.pointer.slice(0, 512) || tr("(root)")}</dd>
            {node.children ? (
              <>
                <dt>{node.type === "object" ? tr("Keys") : tr("Items")}</dt>
                <dd>{formatNumber(node.children.length)}</dd>
                {node.type === "array" && (
                  <>
                    <dt>{tr("Object items")}</dt>
                    <dd>{node.objectItems ?? 0}</dd>
                    <dt>{tr("Primitive items")}</dt>
                    <dd>{node.primitiveItems ?? 0}</dd>
                  </>
                )}
              </>
            ) : (
              <>
                <dt>
                  {node.type === "string" ? tr("Length (UTF-16 units)") : tr("Value")}
                </dt>
                <dd>
                  {node.type === "string"
                    ? formatNumber(String(node.value).length)
                    : valueText(node)}
                </dd>
              </>
            )}
            <dt>{tr("Depth")}</dt>
            <dd>{node.depth}</dd>
          </dl>
          {node.type === "string" &&
            String(node.value).length > JSON_CONFIG.stringPreview && (
              <>
                <button onClick={() => setFull((value) => !value)}>
                  {full ? tr("Show preview") : tr("Show full value")}
                </button>
                <pre className="json-string-detail">
                  {String(node.value).slice(
                    0,
                    full ? JSON_CONFIG.stringDetail : JSON_CONFIG.stringPreview,
                  )}
                </pre>
                {full &&
                  String(node.value).length > JSON_CONFIG.stringDetail && (
                    <p className="json-note">
                      {tr("Detail preview limited to 16,384 characters. Source retains the complete value.")}</p>
                  )}
              </>
            )}
        </section>
      )}
      {model.diagnostics.length > 0 && (
        <section>
          <h3>{tr("Diagnostics")}</h3>
          {model.diagnostics.map((item, i) => (
            <p className="json-diagnostic" key={i}>
              {item.message}
              {item.line && tr(" · Line {v0}, column {v1}", { v0: item.line, v1: item.column })}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

