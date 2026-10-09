import { FloatingPanel } from '../../../components/common/FloatingPanel';
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useMemo, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { JsonDocumentModel } from "./json-model";
import { JSON_CONFIG } from "./json-config";
import { ancestors, friendlyPath, resolvePointer } from "./json-pointer";
import { flattenVisible, rawNode, valueText } from "./json-parser";
import { JsonTreeView } from "./JsonTreeView";
import { JsonSourceView } from "./JsonSourceView";
import { JsonSearch } from "./JsonSearch";
import { registerSearchProvider } from '../../../search/providers';
import { searchJson } from './json-search';
export function JsonViewer({
  model,
  context,
  mode = "tree",
  session,
  updateSession,
  activeCapability,
}: ViewerRenderProps<JsonDocumentModel>) {
  useLocale();
  const [path, setPath] = useState(""),
    [message, setMessage] = useState(""),
    [jump, setJump] = useState(0),
    [navigation, setNavigation] = useState(0);
  const initial = useMemo(
    () =>
      new Set(
        model.nodes.flatMap((node, index) =>
          node.depth === 0 ||
          (model.nodes.length < JSON_CONFIG.autoExpandNodes && node.depth === 1)
            ? [index]
            : [],
        ),
      ),
    [model],
  );
  const expanded =
    (session.metadata.jsonExpanded as Set<number> | undefined) ?? initial;
  const selected = Math.min(
    Number(session.metadata.jsonSelected ?? 0),
    Math.max(0, model.nodes.length - 1),
  );
  const node = model.nodes[selected];
  const save = (patch: Record<string, unknown>) =>
    updateSession({ metadata: { ...session.metadata, ...patch } });
  const select = (index: number) => {
    save({ jsonSelected: index });
    setNavigation((value) => value + 1);
  };
  const navigate = (index: number) => {
    const next = new Set(expanded);
    ancestors(model, index).forEach((parent) => next.add(parent));
    const nextMode = mode === "source" ? "tree" : mode;
    const position = Math.max(
      0,
      flattenVisible(model, next).indexOf(index) * JSON_CONFIG.rowHeight - 72,
    );
    updateSession({
      ...(mode === "source" ? { mode: "tree" } : {}),
      metadata: {
        ...session.metadata,
        jsonExpanded: next,
        jsonSelected: index,
        [`json-${nextMode}-tree-scroll`]: position,
      },
    });
    setNavigation((value) => value + 1);
  };
  const toggle = (index: number) => {
    const next = new Set(expanded);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    const parents = ancestors(model, selected);
    save({
      jsonExpanded: next,
      ...(index !== selected && parents.includes(index) && !next.has(index)
        ? { jsonSelected: index }
        : {}),
    });
  };
  useEffect(()=>registerSearchProvider(context.source,{get label() { return tr("JSON keys and values"); },async search(query,signal){const r=await searchJson(model,query,'both',signal);return{limited:r.limited,hits:r.matches.map(index=>({line:1,column:0,length:0,node:index,offset:model.nodes[index].offset,context:`${model.nodes[index].pointer} ${valueText(model.nodes[index]).slice(0,160)}`}))};},navigateTo(hit){if(hit.node!==undefined)navigate(hit.node);}}),[model,context.source,session]);
  useEffect(()=>{const go=(hit:{line:number;column:number;offset?:number})=>{let offset=hit.offset;if(offset===undefined){let at=0;for(let line=1;line<hit.line;line++){const next=model.source.indexOf('\n',at);if(next<0)break;at=next+1;}offset=at+hit.column;}let best=-1;model.nodes.forEach((node,index)=>{if(node.offset<=offset!&&node.offset+node.length>=offset!)best=index;});if(best>=0)navigate(best);};const pending=session.metadata.productivityMatch as {line:number;column:number;offset?:number}|undefined;if(pending){delete session.metadata.productivityMatch;go(pending);}const onNavigate=(event:Event)=>{const{source,hit}=(event as CustomEvent).detail;if(source===context.source)go(hit);};window.addEventListener('elorin-navigate-search',onNavigate);return()=>window.removeEventListener('elorin-navigate-search',onNavigate);},[model,context.source,session.metadata.productivityMatch]);
  async function copy(kind: "value" | "json" | "key" | "path" | "pointer") {
    if (!node) return;
    const text =
      kind === "json" || (kind === "value" && node.children)
        ? rawNode(model, selected)
        : kind === "key"
          ? node.parent < 0
            ? ""
            : node.key
          : kind === "path"
            ? friendlyPath(model, selected)
            : kind === "pointer"
              ? node.pointer
              : valueText(node);
    if (text.length > JSON_CONFIG.copyBytes) {
      setMessage(
        tr("Copy is limited to 1 Mi characters. Select the original Source instead."),
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (!context.signal.aborted) setMessage(tr("Copied"));
    } catch {
      if (!context.signal.aborted) setMessage(tr("Copy unavailable"));
    }
  }
  useEffect(() =>
    context.registerActions?.([
      {
        id: "json-copy-value",
        get label() { return tr("Copy value"); },
        disabled: !node,
        action: () => copy("value"),
      },
      {
        id: "json-copy-json",
        get label() { return tr("Copy JSON"); },
        disabled: !node,
        action: () => copy("json"),
      },
      {
        id: "json-copy-path",
        get label() { return tr("Copy JSON path"); },
        disabled: !node,
        action: () => copy("path"),
      },
      {
        id: "json-toggle",
        label: expanded.has(selected) ? "Collapse node" : "Expand node",
        disabled: !node?.children,
        action: () => toggle(selected),
      },
    ]),
  );
  const scrollKey = (pane: string) => `json-${mode}-${pane}-scroll`;
  return (
    <div className={`json-viewer json-mode-${mode}`}>
      {activeCapability === "search" && model.status === "ready" && (
        <FloatingPanel title={tr("Search Panel")} layoutId="json-search" owner={context.source} close={()=>context.requestCapability?.(undefined)}><JsonSearch model={model} navigate={navigate} signal={context.signal} /></FloatingPanel>
      )}
      {model.status === "ready" && (
        <div className="json-path-surface">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const index = resolvePointer(model, path);
              if (index === undefined) setMessage(tr("Path not found"));
              else {
                setMessage("");
                navigate(index);
              }
            }}
          >
            <input
              aria-label={tr("JSON Pointer")}
              placeholder={tr("Go to path · /users/0/name")}
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
            <button type="submit">{tr("Go")}</button>
          </form>
          <span
            className="json-current-path"
            dir="auto"
            title={node?.pointer.slice(0, 512)}
          >
            {node ? friendlyPath(model, selected).slice(0, 512) : "$"}
          </span>
          <details className="json-node-actions">
            <summary>{tr("Node actions")}</summary>
            <div>
              {(["value", "key", "json", "path", "pointer"] as const).map(
                (kind) => (
                  <button key={kind} onClick={() => void copy(kind)}>
                    {tr("Copy")}{" "}
                    {kind === "json"
                      ? "JSON"
                      : kind === "pointer"
                        ? tr("JSON Pointer")
                        : kind}
                  </button>
                ),
              )}
              <button
                disabled={model.nodes.length > JSON_CONFIG.expandAllNodes}
                title={
                  model.nodes.length > JSON_CONFIG.expandAllNodes
                    ? tr("Too many nodes to expand safely")
                    : undefined
                }
                onClick={() =>
                  save({
                    jsonExpanded: new Set(model.nodes.map((_, index) => index)),
                  })
                }
              >
                {tr("Expand all")}</button>
              <button
                onClick={() => {
                  save({ jsonExpanded: new Set<number>(), jsonSelected: 0 });
                  setNavigation((value) => value + 1);
                }}
              >
                {tr("Collapse all")}</button>
              <button
                disabled={
                  !node?.children ||
                  model.nodes.length > JSON_CONFIG.expandAllNodes
                }
                onClick={() => {
                  const next = new Set(expanded);
                  const pending = [selected];
                  while (pending.length) {
                    const index = pending.pop()!;
                    next.add(index);
                    for (const child of model.nodes[index].children ?? [])
                      pending.push(child);
                  }
                  save({ jsonExpanded: next });
                }}
              >
                {tr("Expand subtree")}</button>
              <button
                disabled={!node?.children}
                onClick={() => {
                  const next = new Set(expanded);
                  const pending = [selected];
                  while (pending.length) {
                    const index = pending.pop()!;
                    next.delete(index);
                    for (const child of model.nodes[index].children ?? [])
                      pending.push(child);
                  }
                  save({ jsonExpanded: next, jsonSelected: selected });
                }}
              >
                {tr("Collapse subtree")}</button>
            </div>
          </details>
        </div>
      )}
      {message && (
        <p className="json-feedback" role="status">
          {message}
        </p>
      )}
      {model.stats.duplicateKeys > 0 && (
        <p className="json-note json-warning">
          {tr("Duplicate keys detected ·")}{model.stats.duplicateKeys}{tr(". All occurrences retained; pointer navigation uses the last occurrence.")}</p>
      )}
      {model.status !== "ready" && (
        <section className="json-unavailable">
          <h2>
            {model.status === "invalid"
              ? tr("Invalid JSON")
              : model.status === "empty"
                ? tr("Empty JSON document")
                : model.status === "jsonl"
                  ? tr("JSON Lines preview")
                  : tr("Large JSON preview")}
          </h2>
          {model.diagnostics.slice(0, 3).map((item, i) => (
            <p key={i}>
              {tr(item.message)}
              {item.line && tr(" · Line {v0}, column {v1}", { v0: item.line, v1: item.column })}
            </p>
          ))}
          {model.status === "invalid" && (
            <button
              onClick={() => {
                updateSession({ mode: "source" });
                setJump((value) => value + 1);
              }}
            >
              {tr("Jump to error")}</button>
          )}
          <p className="json-note">
            {model.status === "empty"
              ? tr("No content to parse.")
              : tr("Tree unavailable. Original Source remains available.")}
          </p>
        </section>
      )}
      <div className="json-panes">
        {mode !== "source" && model.status === "ready" && (
          <JsonTreeView
            key={`tree-${mode}`}
            model={model}
            selected={selected}
            expanded={expanded}
            select={select}
            toggle={toggle}
            copy={() => void copy("value")}
            navigation={navigation}
            scrollTop={Number(session.metadata[scrollKey("tree")] ?? 0)}
            saveScroll={(top) => {
              session.metadata[scrollKey("tree")] = top;
            }}
          />
        )}
        {(mode !== "tree" || model.status !== "ready") && (
          <JsonSourceView
            key={`source-${mode}`}
            model={model}
            errorJump={jump}
            scrollTop={Number(session.metadata[scrollKey("source")] ?? 0)}
            saveScroll={(top) => {
              session.metadata[scrollKey("source")] = top;
            }}
          />
        )}
      </div>
    </div>
  );
}
