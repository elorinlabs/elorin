import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { JsonDocumentModel, JsonNode } from "./json-model";
import { flattenVisible, valueText } from "./json-parser";
import { JSON_CONFIG } from "./json-config";
export function nodeSummary(model: JsonDocumentModel, node: JsonNode): string {
  if (node.children) {
    if (!node.children.length) return `Empty ${node.type}`;
    const meta = `${node.type === "object" ? tr("Object") : tr("Array")} · ${formatNumber(node.children.length)} ${node.type === "object" ? tr("keys") : tr("items")}`;
    const preview =
      node.type === "array"
        ? node.children
            .slice(0, 3)
            .map((index) => model.nodes[index])
            .filter((child) => !child.children)
            .map((child) => valueText(child).slice(0, 30))
            .join(", ")
        : "";
    return preview
      ? `${meta} — ${preview}${node.children.length > 3 ? ", …" : ""}`
      : meta;
  }
  const value = valueText(node);
  return value.length > JSON_CONFIG.stringPreview
    ? `${value.slice(0, JSON_CONFIG.stringPreview)}…`
    : value;
}
export function JsonTreeView({
  model,
  expanded,
  selected,
  select,
  toggle,
  copy,
  scrollTop,
  saveScroll,
  navigation,
}: {
  model: JsonDocumentModel;
  expanded: Set<number>;
  selected: number;
  select(index: number): void;
  toggle(index: number): void;
  copy(): void;
  scrollTop: number;
  saveScroll(top: number): void;
  navigation: number;
}) {
  useLocale();
  const pane = useRef<HTMLDivElement>(null),
    lastNavigation = useRef(navigation),
    [top, setTop] = useState(scrollTop),
    [height, setHeight] = useState(420);
  const rows = useMemo(
    () => flattenVisible(model, expanded),
    [model, expanded],
  );
  const rowPosition = rows.indexOf(selected);
  useLayoutEffect(() => {
    if (pane.current) {
      pane.current.scrollTop = scrollTop;
      setTop(pane.current.scrollTop);
    }
  }, []);
  useEffect(() => {
    if (!pane.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height),
    );
    observer.observe(pane.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (navigation === lastNavigation.current) return;
    lastNavigation.current = navigation;
    if (!pane.current || rowPosition < 0) return;
    const nodeTop = rowPosition * JSON_CONFIG.rowHeight,
      container = pane.current;
    if (nodeTop < container.scrollTop) container.scrollTop = nodeTop;
    else if (
      nodeTop + JSON_CONFIG.rowHeight >
      container.scrollTop + container.clientHeight
    )
      container.scrollTop =
        nodeTop - (container.clientHeight || height) + JSON_CONFIG.rowHeight;
    setTop(container.scrollTop);
  }, [navigation]);
  const start = Math.max(
    0,
    Math.floor(top / JSON_CONFIG.rowHeight) - JSON_CONFIG.overscan,
  );
  const end = Math.min(
    rows.length,
    Math.ceil((top + height) / JSON_CONFIG.rowHeight) + JSON_CONFIG.overscan,
  );
  const activeRendered = rowPosition >= start && rowPosition < end;
  function keyDown(event: React.KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      if (!window.getSelection()?.toString()) {
        event.preventDefault();
        copy();
      }
      return;
    }
    const node = model.nodes[selected];
    if (
      !node ||
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowRight",
        "ArrowLeft",
        "Enter",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "ArrowDown")
      select(rows[Math.min(rows.length - 1, rowPosition + 1)]);
    if (event.key === "ArrowUp") select(rows[Math.max(0, rowPosition - 1)]);
    if (event.key === "Home") select(rows[0]);
    if (event.key === "End") select(rows.at(-1)!);
    if (event.key === "Enter" && node.children?.length) toggle(selected);
    if (event.key === "ArrowRight" && node.children?.length) {
      if (!expanded.has(selected)) toggle(selected);
      else select(node.children[0]);
    }
    if (event.key === "ArrowLeft") {
      if (node.children?.length && expanded.has(selected)) toggle(selected);
      else if (node.parent >= 0) select(node.parent);
    }
  }
  return (
    <div
      ref={pane}
      className="json-tree-pane"
      role="tree"
      aria-label={tr("JSON structure")}
      tabIndex={0}
      aria-activedescendant={
        activeRendered ? `json-row-${model.nodes[selected]?.offset}` : undefined
      }
      onKeyDown={keyDown}
      onScroll={(event) => {
        const next = event.currentTarget.scrollTop;
        setTop(next);
        saveScroll(next);
      }}
    >
      <div
        className="json-tree-window"
        style={{ height: rows.length * JSON_CONFIG.rowHeight }}
      >
        {rows.slice(start, end).map((index, position) => {
          const node = model.nodes[index],
            hasChildren = !!node.children?.length;
          return (
            <div
              key={node.id}
              id={`json-row-${node.offset}`}
              role="treeitem"
              aria-level={node.depth + 1}
              aria-selected={selected === index}
              aria-expanded={hasChildren ? expanded.has(index) : undefined}
              aria-posinset={node.position}
              aria-setsize={
                node.parent >= 0 ? model.nodes[node.parent].children?.length : 1
              }
              className={`json-tree-row json-${node.type}`}
              style={{
                top: (start + position) * JSON_CONFIG.rowHeight,
                paddingInlineStart: 16 + Math.min(node.depth, 12) * 16,
              }}
              onClick={() => {
                select(index);
                pane.current?.focus();
              }}
            >
              <span
                className="json-disclosure"
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasChildren) toggle(index);
                  pane.current?.focus();
                }}
              >
                {hasChildren ? (expanded.has(index) ? "▾" : "▸") : "·"}
              </span>
              <span
                className="json-key"
                dir="auto"
                title={node.key.slice(0, 512)}
              >
                {node.parent < 0
                  ? node.type === "object"
                    ? tr("Root object")
                    : node.type === "array"
                      ? tr("Root array")
                      : tr("Root value")
                  : node.key.length > JSON_CONFIG.stringPreview
                    ? tr("{v0}…", { v0: node.key.slice(0, JSON_CONFIG.stringPreview) })
                    : node.key || '""'}
              </span>
              <span className="json-value" dir="auto">
                {nodeSummary(model, node)}
              </span>
              {node.depth > 12 && (
                <span className="json-depth">{tr("depth")}{' '}{node.depth}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
