import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useState } from "react";
import type { JsonDocumentModel } from "./json-model";
import { JSON_CONFIG } from "./json-config";
import { searchJson, type JsonSearchScope } from "./json-search";
export function JsonSearch({
  model,
  navigate,
  signal,
}: {
  model: JsonDocumentModel;
  navigate(index: number): void;
  signal: AbortSignal;
}) {
  useLocale();
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState<JsonSearchScope>("both");
  const [result, setResult] = useState<{ matches: number[]; limited: boolean }>(
    { matches: [], limited: false },
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    setResult({ matches: [], limited: false });
    setBusy(!!query);
    const timer = setTimeout(
      () =>
        void searchJson(model, query, scope, controller.signal).then(
          (result) => {
            if (!controller.signal.aborted) {
              setResult(result);
              setBusy(false);
            }
          },
          () => {
            if (!controller.signal.aborted) setBusy(false);
          },
        ),
      JSON_CONFIG.searchDelay,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      signal.removeEventListener("abort", abort);
    };
  }, [model, query, scope, signal]);
  return (
    <section className="json-search" aria-label={tr("JSON search")}>
      <div className="json-search-fields">
        <input
          autoFocus
          aria-label={tr("Search JSON")}
          placeholder={tr("Search keys and values…")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label={tr("Search scope")}
          value={scope}
          onChange={(event) => setScope(event.target.value as JsonSearchScope)}
        >
          <option value="keys">{tr("Keys")}</option>
          <option value="values">{tr("Values")}</option>
          <option value="both">{tr("Both")}</option>
        </select>
        <span role="status">
          {busy
            ? tr("Searching…")
            : result.limited
              ? tr("Showing first 500 matches")
              : tr("{v0} matches", { v0: result.matches.length })}
        </span>
      </div>
      <p className="json-note">
        {tr("Literal search · values include their first 4,096 characters")}</p>
      {result.matches.length > 0 && (
        <div className="json-search-results">
          {result.matches.map((index) => (
            <button
              key={model.nodes[index].id}
              onClick={() => navigate(index)}
              title={model.nodes[index].pointer.slice(0, 512)}
            >
              {model.nodes[index].pointer.slice(0, 512) || tr("(root)")}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
