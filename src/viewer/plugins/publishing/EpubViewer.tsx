import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import {
  SafeDocument,
  openSafeExternal,
  type SafeContent,
} from "../../shared/safe-document";
import { readChapter, type EpubModel } from "./epub-model";
export function EpubInspector({ model: m }: { model: EpubModel }) {
  useLocale();
  return (
    <div className="m11-inspection">
      <h4>{m.title}</h4>
      <dl>
        {Object.entries({
          ...m.metadata,
          Chapters: m.chapters.length,
          Resources: m.resources.size,
          Layout: m.fixed ? "Fixed layout — limited support" : "Reflowable",
          "File size": m.pkg?.context.file.size,
        }).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
      {m.cover && <img src={m.cover} alt={tr("Book cover")} />}
      {m.warnings.map((w, i) => (
        <p key={i}>{w}</p>
      ))}
    </div>
  );
}
export function EpubViewer({
  model: m,
  context,
  session,
  updateSession,
  activeCapability,
}: ViewerRenderProps<EpubModel>) {
  useLocale();
  const [chapter, setChapter] = useState(
      Math.max(
        0,
        Math.min(m.chapters.length - 1, Number(session.metadata.chapter) || 0),
      ),
    ),
    [toc, setToc] = useState(!!session.metadata.toc),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<{ chapter: number; snippet: string }[]>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reading = useRef<HTMLDivElement>(null),
    operation = useRef(0),
    pendingAnchor = useRef(""),
    scrolls = useRef<Record<number, number>>(
      (session.metadata.chapterScrolls as Record<number, number>) ?? {},
    );
  const parsed = useMemo(() => {
    if (!m.pkg || m.error || m.protected || m.fixed) return;
    try {
      return readChapter(m, chapter);
    } catch (e) {
      return { error: String(e) };
    }
  }, [m, chapter]);
  useEffect(() => {
    if (activeCapability === "search") setSearch(true);
    if (activeCapability === "outline") setToc((v) => !v);
  }, [activeCapability]);
  useEffect(() => {
    const root = reading.current;
    if (!root) return;
    root.scrollTop = scrolls.current[chapter] ?? 0;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = "";
    if (anchor)
      requestAnimationFrame(() => {
        root
          .querySelector(`[id="${CSS.escape("prism-content-" + anchor)}"]`)
          ?.scrollIntoView({ block: "start" });
      });
    updateSession({
      metadata: {
        ...session.metadata,
        chapter,
        toc,
        chapterScrolls: scrolls.current,
      },
    });
    return () => {
      scrolls.current[chapter] = root.scrollTop;
    };
  }, [chapter, toc]);
  useEffect(
    () => () => {
      operation.current++;
    },
    [],
  );
  function navigate(target: string) {
    if (target.startsWith("prism-resource:")) {
      const [path, hash] = target.slice(15).split("#"),
        index = m.chapters.findIndex((c) => c.path === path);
      if (index >= 0) {
        pendingAnchor.current = hash ?? "";
        if (index === chapter) {
          reading.current
            ?.querySelector(
              `[id="${CSS.escape("prism-content-" + (hash ?? ""))}"]`,
            )
            ?.scrollIntoView({ block: "start" });
        } else setChapter(index);
      }
    } else void openSafeExternal(context, target);
  }
  async function find() {
    const id = ++operation.current;
    setBusy(true);
    setError("");
    const found: typeof results = [];
    try {
      for (let i = 0; i < m.chapters.length; i++) {
        if (id !== operation.current || context.signal.aborted) return;
        const content = readChapter(m, i, false),
          at = content.text
            .toLocaleLowerCase()
            .indexOf(query.toLocaleLowerCase());
        if (at >= 0)
          found.push({
            chapter: i,
            snippet: content.text.slice(Math.max(0, at - 40), at + 140),
          });
        if (found.length === 500) break;
        await new Promise((r) => setTimeout(r, 0));
      }
      if (id === operation.current) setResults(found);
    } catch (e) {
      if (!context.signal.aborted) setError(uiError(e));
    } finally {
      if (id === operation.current) setBusy(false);
    }
  }
  useEffect(() =>
    context.registerActions?.([
      { id: "contents", get label() { return tr("Contents"); }, action: () => setToc((v) => !v) },
      { id: "search", get label() { return tr("Search"); }, action: () => setSearch((v) => !v) },
      {
        id: "search-selection",
        get label() { return tr("Search selection"); },
        action: () => {
          setQuery(window.getSelection()?.toString().slice(0, 300) ?? "");
          setSearch(true);
        },
      },
    ]),
  );
  if (m.error || m.protected || m.fixed)
    return (
      <div className="m11-message">
        <h3>
          {m.protected
            ? tr("Protected EPUB")
            : m.fixed
              ? tr("Fixed Layout EPUB — Limited support")
              : tr("EPUB preview unavailable")}
        </h3>
        <p>
          {m.error ??
            (m.protected
              ? "This protected content cannot be rendered by Prism."
              : "This book requires a fixed layout renderer. Reflow would change its intended layout; metadata remains available in Inspect.")}
        </p>
        <button
          disabled={!context.services.file.openExternal}
          onClick={() => void context.services.file.openExternal?.()}
        >
          {tr("Open externally")}</button>
      </div>
    );
  const content =
    parsed && !("error" in parsed) ? (parsed as SafeContent) : undefined;
  return (
    <section className="m11-document epub-viewer">
      {search && (
        <div className="m11-search">
          <input
            aria-label={tr("Search book")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search all chapters…")}
          />
          <button disabled={!query || busy} onClick={() => void find()}>
            {tr("Find")}</button>
          <button
            disabled={!busy}
            onClick={() => {
              operation.current++;
              setBusy(false);
            }}
          >
            {tr("Cancel")}</button>
          <button onClick={() => setSearch(false)}>{tr("Close")}</button>
        </div>
      )}
      {search && results.length > 0 && (
        <div className="m11-results">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                setChapter(r.chapter);
                requestAnimationFrame(() => {
                  const text = reading.current;
                  if (text) {
                    const walker = document.createTreeWalker(
                      text,
                      NodeFilter.SHOW_TEXT,
                    );
                    let n: Node | null;
                    while ((n = walker.nextNode())) {
                      const at =
                        n.textContent
                          ?.toLocaleLowerCase()
                          .indexOf(query.toLocaleLowerCase()) ?? -1;
                      if (at >= 0) {
                        const range = document.createRange();
                        range.setStart(n, at);
                        range.setEnd(
                          n,
                          Math.min(
                            (n.textContent ?? "").length,
                            at + query.length,
                          ),
                        );
                        const selection = window.getSelection();
                        selection?.removeAllRanges();
                        selection?.addRange(range);
                        n.parentElement?.scrollIntoView({ block: "center" });
                        break;
                      }
                    }
                  }
                });
              }}
            >
              {m.chapters[r.chapter].title}: {r.snippet}
            </button>
          ))}
        </div>
      )}
      {error && <p role="status">{tr(error)}</p>}
      <div className="m11-document-body">
        {toc && (
          <nav className="m11-toc" aria-label={tr("Book contents")}>
            {m.nav.map((n, i) => (
              <button
                key={i}
                style={{ paddingLeft: 12 + n.depth * 16 }}
                onClick={() => navigate(n.target)}
              >
                {n.label}
              </button>
            ))}
          </nav>
        )}
        <div
          ref={reading}
          className="m11-reading"
          onScroll={(e) => {
            scrolls.current[chapter] = e.currentTarget.scrollTop;
            updateSession({
              metadata: {
                ...session.metadata,
                chapter,
                toc,
                chapterScrolls: scrolls.current,
                progress:
                  (chapter +
                    e.currentTarget.scrollTop /
                      Math.max(
                        1,
                        e.currentTarget.scrollHeight -
                          e.currentTarget.clientHeight,
                      )) /
                  m.chapters.length,
              },
            });
          }}
        >
          <article>
            <h2>{m.chapters[chapter].title}</h2>
            {content ? (
              <SafeDocument content={content} onLink={navigate} />
            ) : (
              <p>
                {parsed && "error" in parsed
                  ? parsed.error
                  : tr("Chapter unavailable.")}
              </p>
            )}
            {!!content?.blocked && (
              <p className="m11-notice">
                {tr("Active content and unavailable images were blocked (")}{content.blocked}).
              </p>
            )}
          </article>
        </div>
      </div>
      <footer className="m11-footer">
        <button
          disabled={chapter === 0}
          onClick={() => setChapter((c) => c - 1)}
        >
          {tr("Previous chapter")}</button>
        <span>
          {chapter + 1} / {m.chapters.length}
        </span>
        <button
          disabled={chapter === m.chapters.length - 1}
          onClick={() => setChapter((c) => c + 1)}
        >
          {tr("Next chapter")}</button>
      </footer>
    </section>
  );
}
