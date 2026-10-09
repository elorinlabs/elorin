import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Element } from "hast";
import type { MarkdownDocumentModel } from "./markdown-model";
import type { ViewerContext } from "../../core/types";
import { classifyMarkdownLink } from "./markdown-links";
import { MarkdownResourceResolver } from "./markdown-resources";
import { navigateHeading } from "./MarkdownOutline";
const DocumentContext = createContext<{
  context: ViewerContext;
  resources: MarkdownResourceResolver;
} | null>(null);
function SafeLink({
  href,
  children,
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: Element }) {
  useLocale();
  const document = useContext(DocumentContext)!;
  const [message, setMessage] = useState("");
  const link = classifyMarkdownLink(href);
  async function open(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setMessage("");
    if (link.kind === "anchor") {
      navigateHeading(
        event.currentTarget.closest(".markdown-reader"),
        link.target,
      );
      return;
    }
    try {
      if (link.kind === "external") {
        if (document.context.services.file.openUrl)
          await document.context.services.file.openUrl(link.target);
        else window.open(link.target, "_blank", "noopener,noreferrer");
      } else if (link.kind === "relative") {
        if (!document.context.services.file.openRelated) {
          setMessage(tr("Related files are available in Tauri Full Mode."));
          return;
        }
        await document.context.services.file.openRelated(link.target);
      }
    } catch {
      if (!document.context.signal.aborted)
        setMessage(tr("This related file or link could not be opened."));
    }
  }
  if (link.kind === "blocked")
    return <span className="markdown-blocked-link">{children}</span>;
  return (
    <>
      <a
        {...props}
        href={
          link.kind === "anchor"
            ? `#${encodeURIComponent(link.target)}`
            : link.kind === "external"
              ? link.target
              : href
        }
        role="link"
        tabIndex={0}
        onClick={(event) => void open(event)}
        onAuxClick={(event) => {
          if (event.button === 1) void open(event);
        }}
        rel="noopener noreferrer"
        title={href}
      >
        {children}
      </a>
      {message && (
        <span className="markdown-inline-message" role="status">
          {message}
        </span>
      )}
    </>
  );
}
function ResourceImage({ src, alt = "", title }: ComponentProps<"img">) {
  useLocale();
  const document = useContext(DocumentContext)!;
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setUrl(undefined);
    setFailed(false);
    if (typeof src !== "string" || !src) {
      setFailed(true);
      return;
    }
    void document.resources.image(src).then(
      (url) => {
        if (current && !document.context.signal.aborted) setUrl(url);
      },
      () => {
        if (current && !document.context.signal.aborted) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [src, document]);
  if (failed)
    return (
      <span
        className="markdown-image-unavailable"
        role="img"
        aria-label={alt || tr("Image unavailable")}
      >
        {tr("Image unavailable")}{alt && <span>{alt}</span>}
      </span>
    );
  return url ? (
    <img
      src={url}
      alt={alt}
      title={title}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  ) : (
    <span className="markdown-image-unavailable" role="status">
      {tr("Loading image…")}</span>
  );
}
function nodeText(node: Element): string {
  return node.children
    .map((child) =>
      child.type === "text"
        ? child.value
        : child.type === "element"
          ? nodeText(child)
          : "",
    )
    .join("");
}
function CodeBlock({
  node,
  children,
}: {
  node?: Element;
  children?: ReactNode;
}) {
  useLocale();
  const [feedback, setFeedback] = useState("");
  const document = useContext(DocumentContext)!;
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 1500);
    return () => clearTimeout(timer);
  }, [feedback]);
  const code = node?.children.find(
    (child) => child.type === "element" && child.tagName === "code",
  ) as Element | undefined;
  const language = (code?.properties.className as string[] | undefined)
    ?.find((name) => name.startsWith("language-"))
    ?.slice(9);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        code ? nodeText(code).replace(/\n$/, "") : "",
      );
      if (!document.context.signal.aborted) setFeedback("Copied");
    } catch {
      if (!document.context.signal.aborted) setFeedback("Copy unavailable");
    }
  }
  return (
    <div className="markdown-code-block">
      <div className="markdown-code-label">
        <span>{language ?? tr("text")}</span>
        <button onClick={() => void copy()}>{feedback || tr("Copy")}</button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
function Table({ children }: { children?: ReactNode }) {
  useLocale();
  return (
    <div className="markdown-table-scroll" tabIndex={0}>
      <table>{children}</table>
    </div>
  );
}
const components = {
  a: SafeLink,
  img: ResourceImage,
  pre: CodeBlock,
  table: Table,
};
export function MarkdownReader({
  model,
  context,
  resources,
}: {
  model: MarkdownDocumentModel;
  context: ViewerContext;
  resources: MarkdownResourceResolver;
}) {
  useLocale();
  const document = useMemo(
    () => ({ context, resources }),
    [context, resources],
  );
  const content = useMemo(
    () =>
      toJsxRuntime(model.tree, {
        Fragment,
        jsx,
        jsxs,
        components,
        passNode: true,
      }),
    [model],
  );
  return (
    <DocumentContext.Provider value={document}>
      <article className="markdown-reader" aria-label={tr("Markdown document")}>
        {model.source.trim() ? (
          content
        ) : (
          <p className="markdown-empty">{tr("Empty Markdown document")}</p>
        )}
      </article>
    </DocumentContext.Provider>
  );
}
