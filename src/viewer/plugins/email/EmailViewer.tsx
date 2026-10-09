import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { EmailModel } from "./email-model";
import { SafeDocument, openSafeExternal } from "../../shared/safe-document";
const address = (value: unknown): string => {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(address).join(", ");
  const v = value as { name?: string; address?: string; group?: unknown[] };
  return v.group
    ? `${v.name}: ${address(v.group)}`
    : v.name
      ? `${v.name}${v.address ? ` <${v.address}>` : ""}`
      : (v.address ?? "");
};
export function EmailInspector({ model: m }: { model: EmailModel }) {
  useLocale();
  const e = m.email;
  return (
    <div className="m11-inspection">
      <dl>
        {Object.entries({
          Subject: e?.subject,
          From: address(e?.from),
          Recipients: [...(e?.to ?? []), ...(e?.cc ?? []), ...(e?.bcc ?? [])]
            .length,
          Date: e?.date,
          Attachments: m.attachments.length,
          "HTML body": !!e?.html,
          "Plain body": !!e?.text,
          "Message-ID": e?.messageId,
          "Headers count": e?.headers.length,
          "DKIM header present": e?.headers.some(
            (h) => h.key === "dkim-signature",
          ),
          "SPF header present": e?.headers.some(
            (h) => h.key === "received-spf",
          ),
          "Remote resources": "Blocked by default",
        })
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
      </dl>
      <p>
        {tr("Authentication headers are displayed as supplied, not verified by Prism.")}</p>
      {m.diagnostics.map((d, i) => (
        <p key={i}>{d}</p>
      ))}
      {m.limited && <p>{m.limited}</p>}
    </div>
  );
}
export function EmailViewer({
  model: m,
  context,
  session,
  updateSession,
  activeCapability,
}: ViewerRenderProps<EmailModel>) {
  useLocale();
  const [plain, setPlain] = useState(
      session.metadata.plain === true || !m.rich,
    ),
    [headers, setHeaders] = useState(!!session.metadata.headers),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [match, setMatch] = useState(0);
  const body = useRef<HTMLDivElement>(null),
    e = m.email;
  useEffect(() => {
    if (activeCapability === "search") setSearch(true);
  }, [activeCapability]);
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = Number(session.metadata.emailScroll) || 0;
    return () => {
      if (el)
        updateSession({
          metadata: {
            ...session.metadata,
            emailScroll: el.scrollTop,
            plain,
            headers,
          },
        });
    };
  }, [plain, headers]);
  useEffect(() =>
    context.registerActions?.([
      { id: "search", get label() { return tr("Search"); }, action: () => setSearch((v) => !v) },
      {
        id: "copy-address",
        get label() { return tr("Copy email address"); },
        disabled: !e?.from,
        action: () => navigator.clipboard.writeText(address(e?.from)),
      },
      {
        id: "copy-subject",
        get label() { return tr("Copy subject"); },
        disabled: !e?.subject,
        action: () => navigator.clipboard.writeText(e?.subject ?? ""),
      },
      {
        id: "copy-message-id",
        get label() { return tr("Copy message ID"); },
        disabled: !e?.messageId,
        action: () => navigator.clipboard.writeText(e?.messageId ?? ""),
      },
    ]),
  );
  function find() {
    const root = body.current;
    if (!root || !query) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      matches: { node: Node; at: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = node.textContent ?? "";
      let at = -1;
      while (
        (at = t
          .toLocaleLowerCase()
          .indexOf(query.toLocaleLowerCase(), at + 1)) >= 0
      ) {
        matches.push({ node, at });
        if (matches.length >= 1000) break;
      }
      if (matches.length >= 1000) break;
    }
    if (!matches.length) {
      setNotice(tr("No matches."));
      return;
    }
    const selected = matches[match % matches.length],
      range = document.createRange();
    range.setStart(selected.node, selected.at);
    range.setEnd(selected.node, selected.at + query.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    selected.node.parentElement?.scrollIntoView({ block: "center" });
    setMatch((n) => n + 1);
    setNotice(tr("{v0} / {v1}", { v0: (match % matches.length) + 1, v1: matches.length }));
  }
  if (m.error || m.limited)
    return (
      <div className="m11-message">
        <h3>
          {m.limited
            ? tr("Outlook MSG — Limited support")
            : tr("Email preview unavailable")}
        </h3>
        <p>{m.error ?? m.limited}</p>
        <p>
          {context.file.name} · {formatNumber(context.file.size)} {tr("bytes")}</p>
        <button
          disabled={!context.services.file.openExternal}
          onClick={() => void context.services.file.openExternal?.()}
        >
          {tr("Open externally")}</button>
      </div>
    );
  return (
    <section className="m11-document email-viewer">
      {search && (
        <div className="m11-search">
          <input
            aria-label={tr("Search message")}
            value={query}
            onChange={(ev) => {
              setQuery(ev.target.value);
              setMatch(0);
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") find();
            }}
          />
          <button onClick={find}>{tr("Next result")}</button>
          <button onClick={() => setSearch(false)}>{tr("Close")}</button>
        </div>
      )}
      {notice && (
        <p role="status" className="m11-notice">
          {notice}
        </p>
      )}
      <div
        ref={body}
        className="m11-reading"
        onScroll={(ev) =>
          updateSession({
            metadata: {
              ...session.metadata,
              emailScroll: ev.currentTarget.scrollTop,
              plain,
              headers,
            },
          })
        }
      >
        <article>
          <header className="m11-email-header">
            <h2>{e?.subject || tr("(No subject)")}</h2>
            <dl>
              {Object.entries({
                From: address(e?.from),
                To: address(e?.to),
                CC: address(e?.cc),
                Date: e?.date,
              })
                .filter(([, v]) => !!v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <button onClick={() => setHeaders((v) => !v)}>
              {headers ? tr("Hide technical headers") : tr("View technical headers")}
            </button>
            {headers && (
              <pre>
                {e?.headers
                  .map((h) => `${h.originalKey}: ${h.value}`)
                  .join("\n")}
              </pre>
            )}
            {m.rich && e?.text && (
              <button onClick={() => setPlain((v) => !v)}>
                {plain ? tr("Rich view") : tr("Plain text")}
              </button>
            )}
          </header>
          {m.rich?.blocked && (
            <p className="m11-notice">
              {tr("Remote images blocked. Active content and external styles are disabled.")}</p>
          )}
          {plain ? (
            <pre className="m11-plain-email">{m.text}</pre>
          ) : (
            m.rich && (
              <SafeDocument
                content={m.rich}
                onLink={(url) => void openSafeExternal(context, url)}
              />
            )
          )}
          {m.attachments.length > 0 && (
            <section className="m11-attachments" aria-label={tr("Email attachments")}>
              <h3>{tr("Attachments (")}{m.attachments.length})</h3>
              {m.attachments.map((att) => (
                <div className="m11-attachment" key={att.id}>
                  <span>
                    {att.name}
                    <small>
                      {formatNumber(att.size)} {' '}{tr("bytes ·")}{" "}
                      {att.detected ?? att.mime} {att.cid ? tr("· inline") : ""}
                    </small>
                  </span>
                  <button
                    onClick={() =>
                      void m.open(att.id).catch((err) => setNotice(String(err)))
                    }
                  >
                    {tr("Open in Prism")}</button>
                </div>
              ))}
            </section>
          )}
        </article>
      </div>
    </section>
  );
}
