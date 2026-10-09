import type { FileDescriptor } from "../../types/files";
import type { ViewerPlugin, LazyViewerRegistration } from "./types";
import { checkAbort } from "./errors";
import { FormatIndex } from '../../formats';
import type { FormatAdapter, OpenOptions } from '../../formats/types';
import type { FileSource } from '../../services/fileSource';
type Entry = Omit<LazyViewerRegistration, "loadPlugin"> & {
  plugin?: ViewerPlugin;
  loadPlugin?: LazyViewerRegistration["loadPlugin"];
  pending?: Promise<ViewerPlugin>;
};
/** Pure selection logic: no UI, detection, filesystem or React runtime dependencies. */
export class ViewerRegistry {
  constructor(private formats=new FormatIndex()){}
  registerAdapter(adapter:FormatAdapter){this.formats.register(adapter);this.changed();}
  unregisterAdapter(id:string){const removed=this.formats.unregister(id);if(removed)this.changed();return removed;}
  formatCapabilities(id:string){return this.formats.get(id)?.capabilities;}
  adapt(source:FileSource,options:OpenOptions){
    const adapter=options.file.format&&this.formats.get(options.file.format.formatId);
    return adapter?adapter.open(source,options).then(document=>{options.onCleanup(document.release);checkAbort(options.signal);return document;}):undefined;
  }
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.listeners.forEach((listener) => listener());
  }
  register<T, I>(plugin: ViewerPlugin<T, I>): void {
    this.add({ ...plugin, plugin: plugin as unknown as ViewerPlugin });
  }
  registerLazy(entry: LazyViewerRegistration): void {
    this.add({ ...entry });
  }
  private add(entry: Entry) {
    if (!entry.id.trim() || this.entries.has(entry.id))
      throw new Error(`Duplicate or empty viewer ID: ${entry.id}`);
    this.entries.set(entry.id, entry);
    this.changed();
  }
  unregister(id: string): boolean {
    const removed = this.entries.delete(id);
    if (removed) this.changed();
    return removed;
  }
  has(id: string): boolean {
    return this.entries.has(id);
  }
  getById(id: string) {
    const entry = this.entries.get(id);
    return entry ? this.metadata(entry) : undefined;
  }
  list() {
    return [...this.entries.values()]
      .sort(this.order)
      .map((entry) => this.metadata(entry));
  }
  private metadata(entry: Entry) {
    return {
      id: entry.id,
      name: entry.name,
      priority: entry.priority ?? 0,
      supportedTypes: [...entry.supportedTypes],
      fallback: entry.fallback,
      loaded: !!entry.plugin,
    };
  }
  private order(a: Entry, b: Entry) {
    return (
      (b.priority ?? 0) - (a.priority ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  }
  private async materialize(entry: Entry): Promise<ViewerPlugin> {
    if (entry.plugin) return entry.plugin;
    entry.pending ??= entry.loadPlugin!()
      .then((plugin) => {
        if (plugin.id !== entry.id)
          throw new Error("Lazy plugin ID does not match its registration.");
        // Registration metadata is authoritative for selection; plugin predicates are also checked.
        entry.plugin = {
          ...plugin,
          priority: entry.priority,
          supportedTypes: [...entry.supportedTypes],
          fallback: entry.fallback,
        };
        return entry.plugin;
      })
      .catch((error) => {
        entry.pending = undefined;
        throw error;
      });
    return entry.pending;
  }
  async resolve(
    file: FileDescriptor,
    options: { signal?: AbortSignal; forceId?: string } = {},
  ): Promise<ViewerPlugin | undefined> {
    checkAbort(options.signal);
    const entries = [...this.entries.values()].sort(this.order);
    const candidates = options.forceId
      ? entries.filter(
          (entry) =>
            entry.id === options.forceId &&
            (!entry.fallback ||
              (entry.fallback === "text" ? file.isText : !file.isText)),
        )
      : [
          ...entries.filter(
            (entry) =>
              !entry.fallback &&
              entry.supportedTypes.includes(file.detectedType),
          ),
          ...entries.filter(
            (entry) => entry.fallback === (file.isText ? "text" : "binary"),
          ),
        ];
    for (const entry of candidates) {
      checkAbort(options.signal);
      if (entry.canHandle && !(await entry.canHandle(file))) continue;
      checkAbort(options.signal);
      const plugin = await this.materialize(entry);
      checkAbort(options.signal);
      if (this.entries.get(entry.id) !== entry) continue;
      if (
        plugin.canHandle &&
        plugin.canHandle !== entry.canHandle &&
        !(await plugin.canHandle(file))
      )
        continue;
      checkAbort(options.signal);
      return plugin;
    }
    return undefined;
  }
}
