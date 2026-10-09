import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useState } from "react";
import type { MarkdownHeading } from "./markdown-model";
export function navigateHeading(root: HTMLElement | null, id: string) {
  const heading = root
    ? Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
        (node) => node.id === id,
      )
    : undefined;
  heading?.scrollIntoView?.({ block: "start", behavior: "auto" });
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
export function MarkdownOutline({
  headings,
  mode,
}: {
  headings: MarkdownHeading[];
  mode?: string;
}) {
  useLocale();
  const [active, setActive] = useState(headings[0]?.id);
  useEffect(() => {
    const host = document.querySelector(".viewer-host");
    const reader = host?.querySelector(".markdown-reader");
    if (!reader || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        root: host?.querySelector(".markdown-reader-pane") ?? null,
        rootMargin: "0px 0px -65% 0px",
      },
    );
    reader
      .querySelectorAll("h1,h2,h3,h4,h5,h6")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [headings, mode]);
  return (
    <nav className="markdown-outline" aria-label={tr("Document outline")}>
      <p className="markdown-eyebrow">{tr("OUTLINE")}</p>
      {headings.length ? (
        headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${encodeURIComponent(heading.id)}`}
            aria-current={active === heading.id ? "location" : undefined}
            style={{
              paddingInlineStart: `${12 + Math.min(heading.depth - 1, 3) * 12}px`,
            }}
            onClick={(event) => {
              event.preventDefault();
              setActive(heading.id);
              navigateHeading(
                event.currentTarget
                  .closest(".viewer-host")
                  ?.querySelector(".markdown-reader") ?? null,
                heading.id,
              );
            }}
          >
            {heading.title}
          </a>
        ))
      ) : (
        <p>{tr("No headings in this document.")}</p>
      )}
    </nav>
  );
}
