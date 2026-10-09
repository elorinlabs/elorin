import type { ViewerContext } from "../../core/types";
import { VirtualFileSystem } from "../../../vfs/VirtualFileSystem";
import { SourceLease, type VirtualNode } from "../../../vfs/types";
import { VFS_BUDGET } from "../../../vfs/config";
import { virtualFileResource } from "../../../services/virtualResource";
import { BrowserArchiveBackend } from "./BrowserArchiveBackend";
import { NativeArchiveBackend } from "./NativeArchiveBackend";
import type { ArchiveBackend, ArchiveEntry, ArchiveInfo } from "./types";
export class ArchiveModel {
  readonly vfs: VirtualFileSystem;
  readonly entries = new Map<string, ArchiveEntry>();
  readonly lease: SourceLease;
  private listeners = new Set<() => void>();
  private revision = 0;
  readonly abort = new AbortController();
  selected?: VirtualNode;
  error?: string;
  ready: Promise<void>;
  constructor(
    readonly backend: ArchiveBackend,
    readonly context: ViewerContext,
  ) {
    this.vfs = new VirtualFileSystem(backend.id, context.file.name);
    this.lease = new SourceLease(() => {
      this.abort.abort();
      backend.close();
    });
    this.ready = this.index();
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = () => this.revision;
  emit() {
    this.revision++;
    for (const f of this.listeners) f();
  }
  get info(): ArchiveInfo {
    return this.backend.info;
  }
  async index() {
    try {
      for await (const page of this.backend.listEntries(this.abort.signal)) {
        for (const entry of page) {
          if (entry.unsafe) continue;
          const id = this.backend.id + ":entry:" + entry.id;
          const node = this.vfs.add({
            id,
            path: entry.path,
            name: entry.path.split("/").at(-1)!,
            kind: entry.kind,
            metadata: { ...entry },
            openSource: () => this.backend.openSource(entry),
          });
          this.entries.set(node.id, entry);
        }
        this.emit();
      }
      this.emit();
    } catch (e) {
      if (!this.abort.signal.aborted) {
        this.error = e instanceof Error ? e.message : "Archive indexing failed";
        this.emit();
      }
    }
  }
  async resource(node: VirtualNode, password?: string) {
    const entry = this.entries.get(node.id);
    if (!entry || node.kind !== "file") throw Error("Entry unavailable");
    const depth = (this.context.source.containerDepth ?? 0) + 1;
    if (depth > VFS_BUDGET.depth)
      throw Error("Nested container depth limit reached");
    const release = this.lease.retain();
    let handed = false;
    try {
      const source = await this.backend.openSource(entry, password);
      source.resolveRelated = async (relative: string) => {
        const { safeResourcePath } =
          await import("../geometry/resource-resolver");
        const safe = safeResourcePath(relative);
        const path = [node.path.split("/").slice(0, -1).join("/"), safe]
          .filter(Boolean)
          .join("/");
        const matches = (this.vfs.paths.get(path) ?? [])
          .map((id) => this.vfs.nodes.get(id)!)
          .filter((n) => n.kind === "file");
        if (matches.length !== 1)
          throw Error("Missing or ambiguous sibling resource");
        return this.resource(matches[0]);
      };
      handed = true;
      return await virtualFileResource(
        node.name,
        source,
        node.id,
        [
          ...(this.context.source.virtualTrail ?? [this.context.file.name]),
          ...node.path.split("/"),
        ],
        depth,
        release,
      );
    } catch (error) {
      if (!handed) release();
      throw error;
    }
  }
}
export async function loadArchive(context: ViewerContext) {
  const source = context.source.persistentSource ?? context.source;
  const signal = new AbortController();
  const backend = source.nativeResource
    ? await NativeArchiveBackend.open(source, context.file.name)
    : new BrowserArchiveBackend(source, context.file.name, signal.signal);
  const model = new ArchiveModel(backend, context);
  context.onCleanup(() => {
    model.lease.release();
  });
  return model;
}
