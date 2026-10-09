import { formatNumber } from "../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { ContextualStatus } from "./ContextualStatus";
import { FileDetailsCard } from './FileDetailsCard';
import { FloatingPanel } from "../../components/common/FloatingPanel";
import { useUiSettings } from "../../platform/ui-settings";
import type { ViewerAction } from "../core/actions";
import { FormatInformation } from '../../formats/FormatInformation';
import { formatIndex } from '../../formats';
import { viewerCommands } from '../../commands/viewer-bridge';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FileDescriptor } from "../../types/files";
import type { FileSource } from "../../services/fileSource";
import { fileServices } from "../../services/fileSource";
import { builtinRegistry } from "../builtins";
import { ViewerController } from "../core/controller";
import type { ViewerRegistry } from "../core/registry";
import { viewerSessionStore } from "../core/session";
import type {
  ViewerCapabilities,
  ViewerRenderProps,
  ViewerServices,
  ViewerState,
} from "../core/types";
import { ViewerErrorBoundary, ViewerErrorView } from "./ViewerErrorBoundary";
import { ViewerShell } from "./ViewerShell";
import { useBinaryActivity } from '../plugins/hex/activity';
import { ViewerError } from '../core/errors';
function DelayedLoading({ loading }: { loading: boolean }) {
  useLocale();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="viewer-loading" role={visible ? "status" : undefined}>
      {visible ? (loading ? "Loading preview…" : "Finding a viewer…") : ""}
    </p>
  );
}
function PluginSurface({
  state,
  props,
  capability,
}: {
  state: Extract<ViewerState, { status: "ready" }>;
  props: ViewerRenderProps;
  capability?: keyof ViewerCapabilities;
}) {
  useLocale();
  const slots = state.plugin.slots?.(props) ?? {};
  const settings = useUiSettings();
  const focusWindow = new URLSearchParams(location.search).get('window') === 'focus';
  const [inspection, setInspection] = useState<unknown>();
  const [floatingInspector,setFloatingInspector]=useState(new URLSearchParams(location.search).get('window')==='focus');
  const [inspectError, setInspectError] = useState<ViewerError>();
  useEffect(() => {
    let current = true;
    if (capability === "inspect" && state.plugin.inspect) {
      setInspection(undefined);
      setInspectError(undefined);
      void Promise.resolve()
        .then(() => state.plugin.inspect!(state.model, state.context))
        .then(
          (result) => {
            if (current && !state.context.signal.aborted) setInspection(result);
          },
          (error) => {
            if (current && !state.context.signal.aborted) setInspectError(ViewerError.from(error));
          },
        );
    }
    return () => {
      current = false;
    };
  }, [state, capability]);
  const inspector=capability === "inspect" && state.plugin.inspect ? <section aria-label={tr("Viewer inspection")}><div className="inspector-panel-actions"><button aria-label={floatingInspector?tr("Dock Inspector"):tr("Float Inspector")} onClick={()=>setFloatingInspector(v=>!v)}>{floatingInspector?tr("Dock"):tr("Float")}</button><button aria-label={tr("Hide Inspector")} onClick={()=>props.context.requestCapability?.(undefined)}>×</button></div><FileDetailsCard context={props.context}/>{inspectError ? <div role="alert"><p>{inspectError.userMessage}</p><details><summary>{tr("技术细节")}</summary><p>{inspectError.diagnosticCode} · {inspectError.code}</p><pre>{inspectError.message}</pre></details></div> : inspection === undefined ? <p role="status">{tr("Loading inspection…")}</p> : state.plugin.renderInspection ? state.plugin.renderInspection(inspection,props) : <pre>{JSON.stringify(inspection,null,2)}</pre>}</section> : slots.rightPanel;
  return <>
    {floatingInspector&&capability==='inspect'&&inspector&&<FloatingPanel title={tr("Floating Inspector")} owner={props.context.source} close={()=>props.context.requestCapability?.(undefined)}>{inspector}</FloatingPanel>}
    <ViewerShell
      {...slots}
      statusFloating={focusWindow || settings.statusBar !== 'show'}
      statusBar={<>{slots.statusBar}<ContextualStatus plugin={state.plugin} props={props}/></>}
      content={state.plugin.render(props)}
      rightPanel={floatingInspector&&capability==='inspect'?undefined:inspector}
    />
  </>;
}
export function ViewerHost({
  file,
  source,
  registry = builtinRegistry,
  services,
  suspended = false,
  active = true,
  embedded = false,
}: {
  file: FileDescriptor;
  source: FileSource;
  registry?: ViewerRegistry;
  services?: ViewerServices;
  suspended?: boolean;
  active?: boolean;
  embedded?: boolean;
}) {
  useLocale();
  const settings=useUiSettings();
  const focusWindow=new URLSearchParams(location.search).get('window')==='focus';
  const pluginActions = useRef<ViewerAction[]>([]);
  const registerActions = useCallback((actions: ViewerAction[]) => {
    pluginActions.current = actions;
    const release = viewerCommands.register(source, actions, 'plugin');
    return () => {
      release();
      if (pluginActions.current === actions) pluginActions.current = [];
    };
  }, [source]);
  const [state, setState] = useState<ViewerState>({ status: "idle" });
  const activity=useBinaryActivity(active);
  const managed=state.status==='ready'&&state.plugin.suspension==='managed';
  const shouldSuspend=suspended||(!activity&&!managed);
  const [revision, setRevision] = useState(0);
  const [forced, setForced] = useState<{ source: FileSource; id: string }>();
  const forceId = forced?.source === source ? forced.id : undefined;
  const [interpretation,setInterpretation]=useState<{source:FileSource;id:string}>();
  const interpretedId=interpretation?.source===source?interpretation.id:undefined;
  const effectiveFile=useMemo(()=>{
    const capability=interpretedId&&formatIndex.get(interpretedId)?.capabilities;
    if(!capability||!file.format?.candidates.includes(capability.formatId))return file;
    return {...file,detectedType:capability.legacyType,format:{...file.format,formatId:capability.formatId,status:'Confirmed' as const,evidence:[...file.format.evidence,{kind:'user' as const,detail:'Explicit interpretation; original bytes are unchanged'}]}};
  },[file,interpretedId]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [floatingTools,setFloatingTools]=useState<'toolbar'|'quick'|undefined>();
  const [generation, setGeneration] = useState(0);
  const [capability, setCapability] = useState<keyof ViewerCapabilities | undefined>(settings.inspector&&!focusWindow&&!embedded ? "inspect" : undefined);
  useEffect(()=>setCapability(settings.inspector&&!focusWindow&&!embedded?"inspect":undefined),[settings.inspector,focusWindow,embedded]);
  const [, redraw] = useState(0);
  const sessions = useRef(viewerSessionStore);
  const scroll = useRef<HTMLDivElement>(null);
  const current = useRef({ file, source });
  const controller = useMemo(
    () => new ViewerController(registry, setState),
    [registry],
  );
  const resolvedServices = useMemo(
    () => services ?? fileServices(file),
    [services, file],
  );
  useEffect(
    () => registry.subscribe(() => setRevision((value) => value + 1)),
    [registry],
  );
  useLayoutEffect(() => {
    const changed =
      current.current.file !== file || current.current.source !== source;
    current.current = { file, source };
    if (changed) {
      setCapability(settings.inspector&&!focusWindow&&!embedded ? "inspect" : undefined);
      setMoreOpen(false);
      setFloatingTools(undefined);
    }
    setGeneration((value) => value + 1);
    if (shouldSuspend) {
      controller.stop();
      setState({ status: "suspended" });
      return;
    }
    return controller.start(
      { file:effectiveFile, source, services: resolvedServices },
      changed ? undefined : forceId,
    );
  }, [
    file,
    source,
    controller,
    resolvedServices,
    revision,
    forceId,
    shouldSuspend,
    effectiveFile,
  ]);
  const ready = state.status === "ready" ? state : undefined;
  const session = ready
    ? sessions.current.get(source, ready.plugin.id)
    : undefined;
  useLayoutEffect(() => {
    if (ready && scroll.current)
      scroll.current.scrollTop = session?.scrollTop ?? 0;
  }, [ready, source]);
  const retry = () => {
    controller.stop();
    setRevision((value) => value + 1);
  };
  const fallback = file.isText
    ? () => {
        setForced({ source, id: "core.text-fallback" });
        setRevision((value) => value + 1);
      }
    : undefined;
  const props: ViewerRenderProps | undefined =
    ready && session
      ? {
          model: ready.model,
          context: {
            ...ready.context,
            active:activity,
            registerActions,
            requestCapability: setCapability,
            openViewer: (id) => {
              setForced({ source, id });
              setRevision((value) => value + 1);
            },
          },
          mode: ready.plugin.modes?.some(mode=>mode.id===session.mode) ? session.mode : ready.plugin.modes?.[0]?.id,
          session,
          activeCapability: capability,
          updateSession(patch) {
            if(ready.context.signal.aborted)return;
            sessions.current.update(source, ready.plugin.id, patch);
            redraw((value) => value + 1);
          },
        }
      : undefined;
  const host = useRef<HTMLDivElement>(null);
  const actions: ViewerAction[] = ready
    ? Object.entries(ready.plugin.capabilities)
        .filter(
          ([key, enabled]) =>
            enabled &&
              !key.startsWith('can') &&
            !(key === "zoom" && ready.plugin.id === "pdf") &&
            !(
              key === "source" &&
              ready.plugin.modes?.some((mode) => mode.id === "source")
            ),
        )
        .map(
          ([key]) =>
            pluginActions.current.find((action) => action.id === key) ?? {
              id: key,
              label: key[0].toUpperCase() + key.slice(1),
              action: () =>
                setCapability(
                  key !== "inspect" && capability === key
                    ? undefined
                    : (key as keyof ViewerCapabilities),
                ),
            },
        )
    : [];
  useEffect(() => viewerCommands.register(source, actions.filter(a => !pluginActions.current.some(p => p.id === a.id))), [source, state.status, ready?.plugin.id, capability]);
  useEffect(() => {
    const element = host.current;
    const collect = (event: Event) => {
      const merged = new Map(
        actions
          .filter((action) => action.id !== "zoom")
          .map((action) => [action.id, action]),
      );
      pluginActions.current.forEach((action) => merged.set(action.id, action));
      (event as CustomEvent<ViewerAction[]>).detail.push(...merged.values());
    };
    element?.addEventListener("prism-context-actions", collect);
    return () => element?.removeEventListener("prism-context-actions", collect);
  });
  return (
    <div className="viewer-host" ref={host} data-viewer-state={!activity?'suspended':state.status} data-session-id={ready?.context.sessionId} data-generation={ready?.context.generation} data-format-id={(ready?.context.file ?? effectiveFile).format?.formatId} data-detection-status={(ready?.context.file ?? effectiveFile).format?.status} data-viewer-id={ready?.plugin.id}>
      {floatingTools&&ready&&<FloatingPanel title={floatingTools==='toolbar'?tr("Floating Toolbar"):tr("Quick Actions")} owner={source} close={()=>setFloatingTools(undefined)} width={380}>{floatingTools==='quick'?<FileDetailsCard context={ready.context}/>:<div className="floating-toolbar-actions">{[...actions,...pluginActions.current.filter(p=>!actions.some(a=>a.id===p.id))].map(action=><button key={action.id} disabled={action.disabled} onClick={()=>void action.action()}>{action.label}</button>)}</div>}</FloatingPanel>}
      {!focusWindow && <FormatInformation file={effectiveFile} choose={id=>{setInterpretation({source,id});setForced(undefined);}} view={id=>{const v=effectiveFile.format&&formatIndex.get(effectiveFile.format.formatId)?.capabilities.supportedViews.find(v=>v.id===id);if(v)setForced({source,id:v.viewerId});}}/>}
      {focusWindow && (state.status === 'loading' || state.status === 'resolving') && <div className="focus-loading-feedback" role="status">{tr("Loading preview…")}{' '}<button onClick={()=>{controller.stop();setState({status:'cancelled'});}}>{tr("Cancel loading")}</button></div>}
      {!focusWindow && <header className="viewer-header">
        <div className="viewer-file-heading">
          <strong>{file.name}</strong>
          <span>
            {file.virtual
              ? file.virtual.trail.join(" › ")
              : (file.path ?? "Browser file · Local path unavailable")}
          </span>
        </div>
        <div className="viewer-file-meta">
          <span>{file.detectedType.toUpperCase()}</span>
          <span>{formatNumber(file.size)} {' '}{tr("bytes")}</span>
        </div>
        <span aria-live="polite" className="viewer-state-label">{!activity?tr("已暂停"):state.status==='loading'||state.status==='resolving'?tr("正在加载"):state.status==='cancelled'?tr("已取消"):state.status==='error'?tr("加载失败"):state.status==='unsupported'?tr("不支持预览"):state.status==='ready'?tr("查看器就绪"):''}</span>
        {(state.status==='resolving'||state.status==='loading')&&<button aria-label={tr("Cancel loading")} onClick={()=>{controller.stop();setState({status:'cancelled'});}}>{tr("取消加载")}</button>}
        {registry.has('hex') && ready?.plugin.id !== 'hex' && ready?.plugin.id !== 'core.binary-fallback' && <button onClick={() => { setForced({ source, id: 'hex' }); setRevision(v => v + 1); }}>{tr("View as Hex")}</button>}
        {ready && (
          <nav aria-label={tr("Viewer controls")}>
            {resolvedServices.file.focus&&<button onClick={()=>void resolvedServices.file.focus!().catch(error=>{window.dispatchEvent(new CustomEvent('elorin-ui-error',{detail:String(error)}));})}>{tr("Focus View")}</button>}
            {forceId && (
              <button
                onClick={() => {
                  setForced(undefined);
                  setRevision((value) => value + 1);
                }}
              >
                {tr("Default viewer")}</button>
            )}
            {actions
              .filter(
                (action) =>
                  action.primary || ["search", "inspect"].includes(action.id),
              )
              .map((action) => (
                <button
                  key={action.id}
                  disabled={action.disabled}
                  aria-pressed={capability === action.id}
                  onClick={() => void action.action()}
                >
                  {action.label}
                </button>
              ))}
            <details className="viewer-more" open={moreOpen}>
              <summary
                data-floating-trigger
                onClick={(event) => {
                  event.preventDefault();
                  setMoreOpen((value) => !value);
                }}
              >
                {tr("More")}</summary>
              {moreOpen && (
                <FloatingPanel title={tr("Viewer actions")} owner={source} close={()=>setMoreOpen(false)}><div className="viewer-more-panel">
                  <button onClick={()=>{setMoreOpen(false);setFloatingTools('toolbar');}}>{tr("Floating Toolbar")}</button><button onClick={()=>{setMoreOpen(false);setFloatingTools('quick');}}>{tr("Quick Actions")}</button>
                  {actions
                    .filter(
                      (action) =>
                        !action.primary &&
                        !["search", "inspect"].includes(action.id),
                    )
                    .map((action) => (
                      <button
                        key={action.id}
                        disabled={action.disabled}
                        onClick={() => void action.action()}
                      >
                        {action.label}
                      </button>
                    ))}
                  {ready.plugin.id === "pdf" &&
                    ready.plugin.modes?.map((mode) => (
                      <button
                        key={mode.id}
                        aria-pressed={props?.mode === mode.id}
                        onClick={() => props?.updateSession({ mode: mode.id })}
                      >
                        {mode.label}
                      </button>
                    ))}
                  {pluginActions.current
                    .filter(
                      (action) =>
                        !action.primary &&
                        !actions.some((a) => a.id === action.id),
                    )
                    .map((action) => (
                      <button
                        key={action.id}
                        disabled={action.disabled}
                        onClick={() => void action.action()}
                      >
                        {action.label}
                      </button>
                    ))}
                </div></FloatingPanel>
              )}
            </details>
          </nav>
        )}
      </header>}
      {ready?.plugin.modes && props && ready.plugin.id !== "pdf" && (
        <nav className="viewer-modes" aria-label={tr("Viewer modes")}>
          {ready.plugin.modes.map((mode) => (
            <button
              key={mode.id}
              aria-pressed={props.mode === mode.id}
              onClick={() => props.updateSession({ mode: mode.id })}
            >
              {mode.icon}
              {mode.label}
            </button>
          ))}
        </nav>
      )}
      <div
        ref={scroll}
        className="viewer-scroll"
        onScroll={(event) => {
          if (ready)
            sessions.current.update(source, ready.plugin.id, {
              scrollTop: event.currentTarget.scrollTop,
            });
        }}
      >
        <ViewerErrorBoundary
          key={generation}
          retry={retry}
          fallback={fallback}
          hex={registry.has('hex')?()=>{setForced({source,id:'hex'});setRevision(v=>v+1);}:undefined}
          onError={(error) => {
            controller.stop();
            setState({ status: "error", plugin: ready?.plugin, error });
          }}
        >
          {ready && props ? (
            <PluginSurface
              key={ready.plugin.id}
              state={ready}
              props={props}
              capability={capability}
            />
          ) : state.status === "error" ? (
            <ViewerErrorView
              error={state.error}
              retry={retry}
              fallback={fallback}
              hex={registry.has('hex')?()=>{setForced({source,id:'hex'});setRevision(v=>v+1);}:undefined}
            />
          ) : state.status === 'suspended' ? <p role="status">{tr("查看器已暂停，恢复活动后重新打开。")}</p> : state.status==='cancelled'? <div role="status"><p>{tr("加载已取消。")}</p><button aria-label={tr("Retry")} onClick={retry}>{tr("重试")}</button></div> : state.status === "unsupported" ? (
            <div className="binary-fallback">
              <h2>{tr("Preview unavailable")}</h2>
              <p>{tr("No viewer is registered for this file.")}</p>
            </div>
          ) : (
            <DelayedLoading loading={state.status === "loading"} />
          )}
        </ViewerErrorBoundary>
      </div>
      {import.meta.env.DEV && !focusWindow && (
        <details className="viewer-debug">
          <summary>{tr("Viewer Inspector")}</summary>
          <dl>
            <dt>{tr("Status")}</dt>
            <dd>{state.status}</dd>
            <dt>{tr("Viewer")}</dt>
            <dd>
              {"plugin" in state ? (state.plugin?.name ?? "None") : tr("None")}
            </dd>
            <dt>{tr("Plugin ID")}</dt>
            <dd>{"plugin" in state ? (state.plugin?.id ?? "—") : "—"}</dd>
            <dt>{tr("Priority")}</dt>
            <dd>{"plugin" in state ? (state.plugin?.priority ?? 0) : "—"}</dd>
            <dt>{tr("Capabilities")}</dt>
            <dd>
              {"plugin" in state
                ? JSON.stringify(state.plugin?.capabilities ?? {})
                : "—"}
            </dd>
            <dt>{tr("Load Time")}</dt>
            <dd>{ready ? tr("{v0} ms", { v0: ready.loadTime.toFixed(1) }) : "—"}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}
