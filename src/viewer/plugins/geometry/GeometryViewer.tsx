import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../../../i18n";
import {ViewerDiagnostic} from '../../components/ViewerDiagnostic';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { GeometryModel } from "./geometry-model";
import { GeometryRenderEngine } from "./render-engine";
import type { Vec3 } from "./types";
import { useBinaryActivity } from '../hex/activity';
import { engineeringCapabilities } from './capabilities';
export function GeometryInspector({ model }: { model: GeometryModel }) {
  useLocale();
  useSyncExternalStore(model.subscribe, model.snapshot);
  const [tab,setTab]=useState<'Model'|'Scene'|'Materials'>('Model');
  const d = model.document,
    n = d.nodes.find((n) => n.id === model.selected);
  return (
    <div className="geometry-inspector">
      <nav className="inspector-tabs" aria-label={tr("Model information tabs")}>{(['Model','Scene','Materials'] as const).map(name=><button key={name} aria-pressed={tab===name} onClick={()=>setTab(name)}>{tr(name)}</button>)}</nav>
      {tab==='Scene'&&<div className="geometry-scene-list"><h3>{tr("Scene Statistics")}</h3><p>{d.nodes.length} {' '}{tr("objects ·")}{' '}{formatNumber(d.geometry.reduce((sum,g)=>sum+g.positions.length/3,0))} {' '}{tr("vertices")}</p>{d.nodes.slice(0,200).map(node=><button key={node.id} aria-pressed={node.id===model.selected} onClick={()=>model.select(node.id)}>{node.name} <small>{node.type}</small></button>)}{d.nodes.length>200&&<p>{tr("First 200 objects. Use Structure to browse the complete virtualized tree.")}</p>}</div>}
      {tab==='Materials'&&<div className="geometry-material-list"><h3>{tr("Materials (")}{d.materials.length})</h3>{d.materials.slice(0,200).map((material,i)=><div key={i}><span className="material-swatch" style={{background:material.color?`rgb(${material.color.slice(0,3).map(n=>Math.round(n*255)).join(' ')})`:'#999'}}/><span><strong>{material.name||tr("Material {v0}", { v0: i+1 })}</strong><small>{material.metalness!==undefined?tr("Metalness {v0} · ", { v0: material.metalness }):''}{material.roughness!==undefined?tr("Roughness {v0}", { v0: material.roughness }):''}{material.image?tr("· Texture"):''}</small></span></div>)}{!d.materials.length&&<p>{tr("No materials were reported.")}</p>}{d.materials.length>200&&<p>{tr("First 200 materials displayed.")}</p>}</div>}
      {tab==='Model'&&<dl>
        {Object.entries(
          n
            ? { Name: n.name, Type: n.type, ...n.metadata }
            : {
                Textures: d.materials.filter((m) => m.image).length,
                Format: d.format,
                Category: d.category,
                Units: d.units,
                Capabilities: engineeringCapabilities(d),
                Dimensions: d.capabilities.preview ? d.bounds.max
                  .map((v, i) => v - d.bounds.min[i])
                  .join(" × ") : undefined,
                Nodes: d.nodes.length,
                Materials: d.materials.length,
                ...d.metadata,
              },
        )
          .filter(([, v]) => v !== undefined)
          .map(([key, value]) => (
            <div key={key}>
              <dt>{tr(key)}</dt>
              <dd>
                {typeof value === "object"
                  ? JSON.stringify(value).slice(0, 4096)
                  : String(value)}
              </dd>
            </div>
          ))}
      </dl>}
      {d.diagnostics.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
      {d.error && <ViewerDiagnostic error={d.error}/>}
    </div>
  );
}
export function GeometryViewer({
  model: m,
  context,
  activeCapability,
  session,
  updateSession,
}: ViewerRenderProps<GeometryModel>) {
  useLocale();
  useSyncExternalStore(m.subscribe, m.snapshot);
  const active = useBinaryActivity(context.active ?? true);
  useEffect(()=>{m.setActive(active);engine.current?.setActive(active);},[m,active]);
  const d = m.document,
    host = useRef<HTMLDivElement>(null),
    engine = useRef<GeometryRenderEngine | undefined>(undefined),
    [structure, setStructure] = useState(false),
    [query, setQuery] = useState(""),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [scroll, setScroll] = useState(0),
    [measure, setMeasure] = useState(false),
    [points, setPoints] = useState<Vec3[]>(
      (session.metadata.measurePoints as Vec3[]) ?? [],
    ),
    [error, setError] = useState(""),
    [projection, setProjection] = useState(
      d.category === "drawing" ? "Orthographic" : "Perspective",
    ),
    [wire, setWire] = useState(false);
  const sessionRef = useRef(session.metadata);
  sessionRef.current = session.metadata;
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useEffect(() => {
    if (activeCapability === "outline") setStructure(true);
  }, [activeCapability]);
  useEffect(() => {
    if (!active || !host.current || !d.capabilities.preview) return;
    setError("");
    try {
      const render = new GeometryRenderEngine(host.current, d, (id, point) => {
        if (measureRef.current && point)
          setPoints((previous) =>
            previous.length === 1 ? [previous[0], point] : [point],
          );
        else {
          m.select(id);
          render.select(id);
        }
      });
      engine.current = render;
      render.restore(sessionRef.current.geometryView);
      const selected = sessionRef.current.selectedNode;
      if (typeof selected === "string") {
        m.select(selected);
        render.select(selected);
      }
      render.measurement(points);
      return () => {
        updateSession({
          metadata: {
            ...sessionRef.current,
            geometryView: render.snapshot(),
            selectedNode: m.selected,
          },
        });
        render.dispose();
        engine.current = undefined;
      };
    } catch (e) {
      setError((e as Error).message);
    }
  }, [d, active]);
  useEffect(() => {
    engine.current?.measurement(points);
    updateSession({ metadata: { ...session.metadata, measurePoints: points } });
  }, [points]);
  useEffect(()=>{engine.current?.select(m.selected);},[m.selected]);
  useEffect(() =>
    context.registerActions?.([
      {
        id: "fit-model",
        get label() { return tr("Fit Model"); },
        shortcut: "Home",
        action: () => engine.current?.fit(),
      },
      {
        id: "reset-view",
        get label() { return tr("Reset View"); },
        action: () => engine.current?.view("reset"),
      },
      {
        id: "projection",
        get label() { return tr("Perspective / Orthographic"); },
        action: () => {
          const value = engine.current?.projection();
          if (value) setProjection(value);
        },
      },
      {
        id: "frame-selected",
        get label() { return tr("Frame Selected"); },
        disabled: !m.selected,
        action: () => engine.current?.fit(m.selected),
      },
      {
        id: "hide-selected",
        get label() { return tr("Hide"); },
        disabled: !m.selected,
        action: () => {
          if (m.selected) engine.current?.hide(m.selected);
        },
      },
      {
        id: "isolate-selected",
        get label() { return tr("Isolate"); },
        disabled: !m.selected,
        action: () => {
          if (m.selected) engine.current?.isolate(m.selected);
        },
      },
      {
        id: "show-all",
        get label() { return tr("Show All"); },
        action: () => engine.current?.showAll(),
      },
      {
        id: "measure",
        primary: true,
        get label() { return tr("Measure"); },
        action: () => {
          setMeasure(true);
          setPoints([]);
        },
      },
      {
        id: "outline",
        primary: true,
        label: d.category === "drawing" ? "Layers" : "Structure",
        action: () => setStructure((v) => !v),
      },
      {
        id: "fullscreen",
        get label() { return tr("Fullscreen"); },
        action: () => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void host.current?.requestFullscreen();
        },
      },
      {
        id: "clear-measurement",
        get label() { return tr("Clear Measurement"); },
        action: () => {
          setPoints([]);
          setMeasure(false);
        },
      },
      ...(d.category === "cad"
        ? ["low", "normal", "high"].map((quality) => ({
            id: "quality-" + quality,
            label: "CAD Quality: " + quality,
            action: () => m.reload(quality),
          }))
        : []),
      ...["front", "back", "left", "right", "top", "bottom"].map((view) => ({
        id: "view-" + view,
        label: view[0].toUpperCase() + view.slice(1),
        action: () => engine.current?.view(view),
      })),
      {
        id: 'shaded-edges', get label() { return tr("Shaded + Edges"); }, action: () => {
          try { engine.current?.wireframe(false);engine.current?.shadedEdges(true);setWire(false); }catch(e){setError(uiError(e));}
        },
      },
      {
        id: "wireframe",
        label: wire ? "Shaded" : "Wireframe",
        action: () => {
          setWire((v) => !v);
          engine.current?.shadedEdges(false);
          engine.current?.wireframe(!wire);
        },
      },
      {
        id: "grid",
        get label() { return tr("Show / Hide Grid"); },
        action: () => engine.current?.gridToggle(),
      },
    ]),
  );
  const hierarchy = useMemo(() => {
    const map = new Map(d.nodes.map((n) => [n.id, n]));
    const depths = new Map<string, number>();
    for (const n of d.nodes) {
      let depth = 0,
        parent = n.parentId;
      while (parent && depth < 128) {
        depth++;
        parent = map.get(parent)?.parentId ?? null;
      }
      depths.set(n.id, depth);
    }
    return { map, depths };
  }, [d]);
  const nodes = useMemo(
    () =>
      d.nodes.filter((n) => {
        if (n.metadata.batch) return false;
        if (query)
          return n.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
        let parent = n.parentId;
        while (parent) {
          if (collapsed.has(parent)) return false;
          parent = hierarchy.map.get(parent)?.parentId ?? null;
        }
        return true;
      }),
    [d, query, collapsed, hierarchy],
  );
  const first = Math.max(0, Math.floor(scroll / 32) - 3),
    visible = nodes.slice(first, first + 30);
  const dimensions = d.bounds.max.map((v, i) => v - d.bounds.min[i]),
    distance =
      points.length === 2
        ? Math.hypot(...points[0].map((v, i) => v - points[1][i]))
        : undefined;
  return (
    <section
      className="geometry-viewer"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,select,textarea")) return;
        if (e.key === "Escape") {
          setMeasure(false);
          m.select();
          engine.current?.select();
        } else if (e.key === "Home") {
          e.preventDefault();
          engine.current?.fit();
        } else if ("123456".includes(e.key) && e.key)
          engine.current?.view(
            ["front", "back", "left", "right", "top", "bottom"][
              Number(e.key) - 1
            ],
          );
        else if (e.key.toLowerCase() === "p") {
          const p = engine.current?.projection();
          if (p) setProjection(p);
        } else if (e.shiftKey && e.key.toLowerCase() === "f")
          engine.current?.fit(m.selected);
      }}
    >
      <div className="geometry-content">
        {structure && (
          <aside className="geometry-structure">
            <input
              aria-label={tr("Search structure")}
              placeholder={tr("Search structure…")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setScroll(0);
              }}
            />
            <div
              className="geometry-tree"
              onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
            >
              <div style={{ height: nodes.length * 32, position: "relative" }}>
                {visible.map((node, i) => (
                  <div
                    className="geometry-tree-row"
                    key={node.id}
                    style={{
                      position: "absolute",
                      top: (first + i) * 32,
                      height: 32,
                      paddingLeft: Math.min(
                        8 + (hierarchy.depths.get(node.id) ?? 0) * 12,
                        96,
                      ),
                    }}
                  >
                    {node.children.length > 0 && (
                      <button
                        aria-label={tr("{v0} {v1}", { v0: tr(collapsed.has(node.id) ? "Expand" : "Collapse"), v1: node.name })}
                        aria-expanded={!collapsed.has(node.id)}
                        style={{ flex: "0 0 20px", padding: 0 }}
                        onClick={() =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);
                            next.has(node.id)
                              ? next.delete(node.id)
                              : next.add(node.id);
                            return next;
                          })
                        }
                      >
                        {collapsed.has(node.id) ? "▸" : "▾"}
                      </button>
                    )}
                    <button
                      style={{ flex: 1, minWidth: 0 }}
                      aria-pressed={m.selected === node.id}
                      onClick={() => {
                        m.select(node.id);
                        engine.current?.select(node.id);
                      }}
                      onDoubleClick={() => engine.current?.fit(node.id)}
                    >
                      {node.name}
                    </button>
                    <button
                      aria-label={tr("{v0} {v1}", { v0: tr(engine.current?.isHidden(node.id) ? "Show" : "Hide"), v1: node.name })}
                      onClick={() => {
                        engine.current?.toggle(node.id);
                        m.emit();
                      }}
                    >
                      ◌
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
        <div className="geometry-viewport" ref={host}>
          {d.capabilities.preview&&<div className="geometry-view-controls" aria-label={tr("Model view directions")}>{['top','front','right'].map(view=><button key={view} aria-label={tr("View {v0}", { v0: view })} onClick={()=>engine.current?.view(view)}>{view==='top'?'Z':view==='front'?'Y':'X'}</button>)}</div>}
          {(!d.capabilities.preview || error) && (
            <div className="geometry-empty">
              {error || d.error ? <ViewerDiagnostic error={error || d.error}/> : <p>{m.progress || tr("No renderable geometry found.")}</p>}
              {context.services.file.openExternal && (
                <button onClick={() => context.services.file.openExternal?.()}>
                  {tr("Open externally")}</button>
              )}
            </div>
          )}
        </div>
      </div>
      <footer>
        {measure
          ? tr("Measure distance · click two surface points · Esc to exit")
          : tr("{v0} · {v1}", { v0: tr(d.category === "drawing" ? "Drawing" : "Model"), v1: dimensions.map((v) => Number(v.toPrecision(6))).join(" × ") })}{" "}
        · {d.units === "unknown" ? tr("Units not specified") : d.units}
        {d.reduced && tr("· Reduced preview")}
        {distance !== undefined &&
          tr(" · Distance {v0} {v1} (approximate)", { v0: Number(distance.toPrecision(6)), v1: d.units === "unknown" ? tr("units") : d.units })}
      </footer>
    </section>
  );
}
