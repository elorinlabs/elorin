import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useTextModel, type TextDocumentModel } from "./text-model";
import { recognizeLog } from "./text-profile";
import type { TextLineData } from "./text-engine";
export function TextInspector({
  model,
  selected,
}: {
  model: TextDocumentModel;
  selected?: TextLineData;
}) {
  useLocale();
  useTextModel(model);
  const field = (name: string, value: unknown) => (
    <div key={name}>
      <dt>{tr(name)}</dt>
      <dd>{["Profile","Language","Size class","Highlighting","Index status","Detected timestamps (sample)","Levels"].includes(name) ? tr(String(value ?? "—")) : String(value ?? "—")}</dd>
    </div>
  );
  const log = selected ? recognizeLog(selected.text) : undefined;
  return (
    <section className="text-inspector" aria-label={tr("Text inspection")}>
      <h3>
        {selected
          ? tr("LINE {v0}", { v0: formatNumber(selected.number) })
          : model.profile === "Log"
            ? tr("LOG")
            : tr("TEXT")}
      </h3>
      <dl>
        {field("Profile", model.profile)}
        {field("Language", model.language ?? "Plain text")}
        {selected ? (
          <>
            {field(
              "Length",
              selected.truncated
                ? tr("{v0} bytes · preview",{v0:formatNumber((selected.end-selected.offset))})
                : tr("{v0} chars",{v0:formatNumber(selected.text.length)}),
            )}
            {log?.timestamp && field("Timestamp", log.timestamp)}
            {log?.level && field("Level", log.level)}
          </>
        ) : (
          <>
            {field(
              "Lines",
              `${formatNumber(model.stats.lines)}${model.status === "complete" ? "" : tr(" · Indexing incomplete")}`,
            )}
            {field(
              "Characters (UTF-16 units)",
              `${formatNumber(model.stats.characters)}${model.status === "complete" ? "" : "+"}`,
            )}
            {field("Encoding", model.encoding)}
            {field("Line endings", model.lineEndings)}
            {field(
              "Longest line",
              `${formatNumber(model.stats.longestLine)} ${tr("chars")}${model.status === "complete" ? "" : tr(" · indexed prefix")}`,
            )}
            {field("Blank lines", formatNumber(model.stats.blank))}
            {field("Size class", model.sizeClass)}
            {field("Highlighting", model.highlightStrategy)}
            {field("Index status", model.status)}
            {field("Indexed bytes", formatNumber(model.stats.processed))}
            {model.profile === "Log" && (
              <>
                {field(
                  "Detected timestamps (sample)",
                  model.timestamps ? "Yes" : "No",
                )}
                {field("Levels", "Sampled · first 16 KiB")}
                {Object.entries(model.logLevels).map(([level, count]) =>
                  field(level, count),
                )}
              </>
            )}
          </>
        )}
      </dl>
      {model.lineEndings === "Mixed" && (
        <p>{tr("Mixed line endings · original text preserved.")}</p>
      )}
      {model.stats.malformed && (
        <p>{tr("Malformed encoding · replacement characters may be shown.")}</p>
      )}
      {model.stats.longestLine > 4096 && (
        <p>{tr("Very long lines use bounded previews.")}</p>
      )}
      {model.diagnostics.map((message, i) => (
        <p key={i}>{tr(message)}</p>
      ))}
    </section>
  );
}
