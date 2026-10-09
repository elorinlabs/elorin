import type { FileDescriptor } from "../../types/files";
import type { FileSource } from "../../services/fileSource";
import { bindFileSource } from "../../services/fileSource";
import type {
  ViewerContext,
  ViewerPlugin,
  ViewerServices,
  ViewerState,
} from "./types";
import { ViewerError } from "./errors";
import { ViewerRegistry } from "./registry";
import { FormatResourceScope } from '../../formats/resources';
export interface ViewerInput {
  file: FileDescriptor;
  source: FileSource;
  services: ViewerServices;
}
export class ViewerController {
  private static nextId=0;
  private readonly id=++ViewerController.nextId;
  private generation=0;
  private cancelCurrent?: () => void;
  constructor(
    private registry: ViewerRegistry,
    private publish: (state: ViewerState) => void,
    private readonly openingTimeoutMs=120000,
  ) {}
  start(input: ViewerInput, forceId?: string): () => void {
    this.stop();
    const generation=++this.generation;
    const abort = new AbortController();
    let active = true,
      loading = false,
      disposed = false;
    let plugin: ViewerPlugin | undefined, model: unknown;
    const cleanups = new Set<() => void>();
    const safely = (cleanup: () => void) => {
      try {
        cleanup();
      } catch (error) {
        if (import.meta.env.DEV) console.error("Viewer cleanup failed", error);
      }
    };
    const context: ViewerContext = {
      sessionId:`viewer-${this.id}-${generation}`,
      generation,
      ...input,
      source: bindFileSource(input.source, abort.signal),
      signal: abort.signal,
      onCleanup(cleanup) {
        if (!active) safely(cleanup);
        else cleanups.add(cleanup);
      },
    };
    context.resources=new FormatResourceScope(context.source,abort.signal);
    context.onCleanup(()=>context.resources?.dispose());
    const dispose = () => {
      if (!plugin || disposed || loading) return;
      disposed = true;
      try {
        Promise.resolve(plugin.dispose?.(context, model)).catch((error) => {
          if (import.meta.env.DEV)
            console.error("Viewer disposal failed", error);
        });
      } catch (error) {
        if (import.meta.env.DEV) console.error("Viewer disposal failed", error);
      }
    };
    const cancel = () => {
      if (!active) return;
      active = false;
      abort.abort();
      cleanups.forEach(safely);
      cleanups.clear();
      dispose();
    };
    this.cancelCurrent = cancel;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    let rejectBoundary!:(error:unknown)=>void;
    const boundary=new Promise<never>((_,reject)=>{rejectBoundary=reject;});
    void boundary.catch(()=>{}); // Handles cancellation before the first awaited boundary is attached.
    const abortBoundary=()=>rejectBoundary(new ViewerError('ABORTED','Loading was cancelled.'));
    abort.signal.addEventListener('abort',abortBoundary,{once:true});
    deadline=setTimeout(()=>rejectBoundary(new ViewerError('OPERATION_TIMEOUT','预览加载超时，已停止等待；可重试或选择其他查看方式。')),this.openingTimeoutMs);
    // The underlying promise can finish after abort/timeout. Its resources remain cleanup-bound.
    const bounded=<T,>(task:Promise<T>)=>Promise.race([task,boundary]);
    this.publish({ status: "resolving" });
    void (async () => {
      const started = performance.now();
      try {
        const pendingAdapter=(forceId==='hex'||forceId==='core.text-fallback')?undefined:this.registry.adapt(context.source,{file:input.file,signal:abort.signal,onCleanup:context.onCleanup});
        const adapted=pendingAdapter?await bounded(pendingAdapter):undefined;
        if(!active)return;
        if(adapted){
          const sourceChanged=adapted.source!==input.source&&adapted.source!==context.source;
          context.file=adapted.file;context.source=bindFileSource(adapted.source,abort.signal);
          if(sourceChanged){
            context.resources?.dispose();
            context.resources=new FormatResourceScope(context.source,abort.signal);
          }
        }
        if(adapted&&!this.registry.has(adapted.view.viewerId)&&!forceId)throw Error(`Required viewer backend is unavailable: ${adapted.view.viewerId}`);
        plugin = await bounded(this.registry.resolve(context.file, {
          signal: abort.signal,
          forceId: forceId??adapted?.view.viewerId,
        }));
        if (!active) {
          dispose();
          return;
        }
        if (!plugin) {
          this.publish({ status: "unsupported" });
          return;
        }
        this.publish({ status: "loading", plugin });
        loading = true;
        let task:Promise<unknown>;
        try { task=plugin.load(context); }
        catch(error) { loading=false; throw error; }
        const pending=task.then(value=>{model=value;loading=false;if(!active)dispose();return value;},error=>{loading=false;if(!active)dispose();throw error;});
        // Cancellation stops waiting; the original task still owns disposal until it settles.
        model = await bounded(pending);
        if (!active) {
          dispose();
          return;
        }
        this.publish({
          status: "ready",
          plugin,
          context,
          model,
          loadTime: performance.now() - started,
        });
      } catch (error) {
        if (active) {
          cancel();
          this.publish({
            status: "error",
            plugin,
            error: ViewerError.from(error),
          });
        } else dispose();
      } finally {
        clearTimeout(deadline);
        abort.signal.removeEventListener('abort',abortBoundary);
      }
    })();
    return cancel;
  }
  stop() {
    this.cancelCurrent?.();
    this.cancelCurrent = undefined;
  }
}
