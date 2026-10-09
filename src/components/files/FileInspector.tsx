import { formatNumber, formatDate } from "../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { X } from "lucide-react";
import { Surface, IconButton } from "../common/ui";
import type { FileDescriptor } from "../../types/files";
const messages: Record<string, string> = {
  EXTENSION_MISMATCH: "File extension does not match detected content.",
  UNKNOWN_FORMAT:
    "No supported signature or readable text encoding was identified.",
  CORRUPTED_SIGNATURE:
    "Signature found, but the sampled structure is truncated or inconsistent.",
  ENCODING_UNCERTAIN: "Text encoding could not be established.",
  CONTENT_UNVERIFIED: "Type hint found; content has not been validated.",
  SAMPLE_TRUNCATED:
    "Only the detection sample was read; full content has not been validated.",
  ARCHIVE_INSPECTION_LIMIT:
    "ZIP64, multi-disk, or large ZIP directory was not inspected. Container remains ZIP.",
  FILE_CHANGED: "The file changed during inspection. Select it again.",
};
export function FileInspector({
  files,
  onDismiss,
}: {
  files: FileDescriptor[];
  onDismiss: () => void;
}) {
  useLocale();
  return (
    <section className="file-inspector" aria-label={tr("File Inspector")}>
      <div className="section-heading">
        <div>
          <h2>{tr("File Inspector")}</h2>
          <p className="inspector-note">
            {tr("Type identification only · No file content is rendered")}</p>
        </div>
        <IconButton aria-label={tr("Dismiss inspector")} onClick={onDismiss}>
          <X size={19} />
        </IconButton>
      </div>
      {files.map((file, index) => (
        <Surface
          className="inspector-file"
          key={`${file.path ?? file.name}-${index}`}
        >
          <h3>{file.name}</h3>
          <dl>
            {Object.entries({
              Name: file.name,
              Path: file.path ?? tr("Unavailable in Browser Preview"),
              Size: tr("{v0} bytes", {v0:formatNumber(file.size)}),
              Extension: file.extension ?? "—",
              "Detected Type": file.detectedType.toUpperCase(),
              "Format": file.format?.formatId ?? '—',
              "Detection Status": file.format?.status ?? '—',
              "Detection Evidence": file.format?.evidence.map(e=>`${e.kind}: ${e.detail}`).join(' · ') ?? '—',
              MIME: file.mimeType ?? "—",
              Encoding: file.encoding ?? "—",
              Binary: file.isBinary ? "Yes" : "No",
              Text: file.isText ? "Yes" : "No",
              Confidence: `${Math.round(file.confidence * 100)}%`,
              "Detection Source": file.detectionSource.join(", ") || "—",
              "Language Hint": file.languageHint ?? "—",
              Modified: file.modifiedAt
                ? formatDate(new Date(file.modifiedAt), {dateStyle:'short',timeStyle:'medium'})
                : "—",
              Created: file.createdAt
                ? formatDate(new Date(file.createdAt), {dateStyle:'short',timeStyle:'medium'})
                : "—",
              "Bytes Read": tr("{v0} ({v1} sample)",{v0:formatNumber(file.bytesRead),v1:formatNumber(file.sampleBytes)}),
              Mode:
                file.mode === "browser"
                  ? "Browser Preview Mode"
                  : "Tauri Full Mode",
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{tr(label === 'Modified' ? 'Modified time' : label)}</dt>
                <dd>{['Binary','Text','Mode','Detection Status'].includes(label) ? tr(value) : value}</dd>
              </div>
            ))}
          </dl>
          <div className="inspector-warnings">
            <h4>{tr("Warnings")}</h4>
            {file.warnings.length ? (
              file.warnings.map((warning, i) => (
                <p key={i}>
                  <strong>{warning.code}</strong> — {tr(messages[warning.code])}
                  {warning.expected &&
                    tr(" Expected {v0}, detected {v1}.", { v0: warning.expected.toUpperCase(), v1: warning.detected?.toUpperCase() })}
                </p>
              ))
            ) : (
              <p>{tr("No detection warnings.")}</p>
            )}
          </div>
          <p className="inspector-note">
            {tr("Confidence describes identification evidence, not file validity. Full format validation belongs to a later Viewer.")}</p>
        </Surface>
      ))}
    </section>
  );
}

