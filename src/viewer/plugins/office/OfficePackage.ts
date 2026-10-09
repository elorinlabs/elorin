import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import { OFFICE_BUDGET, safeXml, unpackOffice } from "./package";
import { sanitizeSvg } from "../image/svg-sanitizer";
import { readImageHeader } from "../image/image-metadata";

export const descendants = (e: Document | Element, name: string) =>
  Array.from(e.getElementsByTagNameNS("*", name));
export const childElements = (e: Element, name: string) =>
  Array.from(e.children).filter((n) => n.localName === name);
export const firstElement = (e: Document | Element, name: string) =>
  descendants(e, name)[0];
export const attribute = (e: Element | undefined, name: string) =>
  e
    ? ((name === "id"
        ? Array.from(e.attributes).find(
            (a) => a.localName === name && !!a.namespaceURI,
          )
        : undefined
      )?.value ??
      Array.from(e.attributes).find((a) => a.localName === name)?.value)
    : undefined;
export function relationshipPath(
  base: string,
  target: string,
): string | undefined {
  if (
    /^[a-z]+:/i.test(target) ||
    target.startsWith("/") ||
    target.includes("\\") ||
    /[\u0000-\u001f]/.test(target)
  )
    return;
  const parts = base.split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (p === "..") {
      if (!parts.length) return;
      parts.pop();
    } else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}
export interface Relationship {
  target: string;
  external: boolean;
  type: string;
}
/** One package boundary for all Office viewers. Never fetches relationships. */
export class OfficePackage {
  readonly metadata: Record<string, string> = {};
  readonly attachments: string[];
  readonly macros: boolean;
  private images = new Map<string, string>();
  private released = false;
  constructor(
    readonly entries: Map<string, Uint8Array>,
    readonly context: ViewerContext,
    private readonly imageCapacity = 32,
  ) {
    this.attachments = [...entries.keys()].filter((n) =>
      /(?:embeddings\/|ObjectReplacements\/|vbaProject|ActiveX|Scripts\/)/i.test(
        n,
      ),
    );
    this.macros = this.attachments.some((n) => /vbaProject|Scripts\//i.test(n));
    const meta = this.xml(
      entries.has("docProps/core.xml") ? "docProps/core.xml" : "meta.xml",
    );
    if (meta)
      for (const n of Array.from(
        meta.documentElement.getElementsByTagName("*"),
      ))
        if (!n.children.length)
          this.metadata[n.localName] = (n.textContent ?? "").slice(0, 1000);
    context.onCleanup(() => this.dispose());
  }
  xml(name: string) {
    checkAbort(this.context.signal);
    const b = this.entries.get(name);
    return b ? safeXml(b) : undefined;
  }
  relationships(base: string) {
    const at = base.lastIndexOf("/");
    const file = `${base.slice(0, at + 1)}_rels/${base.slice(at + 1)}.rels`;
    const result = new Map<string, Relationship>();
    const doc = this.xml(file);
    if (doc)
      for (const n of descendants(doc, "Relationship")) {
        const target = attribute(n, "Target") ?? "",
          external = attribute(n, "TargetMode") === "External";
        result.set(attribute(n, "Id") ?? "", {
          target: external ? target : (relationshipPath(base, target) ?? ""),
          external,
          type: attribute(n, "Type")?.split("/").pop() ?? "",
        });
      }
    return result;
  }
  image(name: string) {
    if (this.released) return;
    if (this.images.has(name)) {
      const u = this.images.get(name)!;
      this.images.delete(name);
      this.images.set(name, u);
      return u;
    }
    const bytes = this.entries.get(name);
    if (!bytes || bytes.length > 8 * 1024 * 1024) return;
    let format = name.split(".").pop()?.toLowerCase();
    if (format === "jpg") format = "jpeg";
    let blob: Blob;
    try {
      if (format === "svg")
        blob = new Blob([sanitizeSvg(new TextDecoder().decode(bytes)).source], {
          type: "image/svg+xml",
        });
      else {
        if (
          !["png", "jpeg", "gif", "webp", "bmp", "avif"].includes(format ?? "")
        )
          return;
        const h = readImageHeader(bytes, format as never);
        if (
          !h.width ||
          !h.height ||
          h.width > 32768 ||
          h.height > 32768 ||
          h.width * h.height > 32000000
        )
          return;
        blob = new Blob([bytes.slice().buffer], { type: `image/${format}` });
      }
    } catch {
      return;
    }
    const url = URL.createObjectURL(blob);
    this.images.set(name, url);
    while (this.images.size > this.imageCapacity) {
      const key = this.images.keys().next().value!;
      URL.revokeObjectURL(this.images.get(key)!);
      this.images.delete(key);
    }
    return url;
  }
  dispose() {
    if (this.released) return;
    this.released = true;
    for (const url of this.images.values()) URL.revokeObjectURL(url);
    this.images.clear();
    this.entries.clear();
  }
}
export async function loadOfficePackage(context: ViewerContext) {
  const size = await context.source.getSize();
  const budget = {
    ...OFFICE_BUDGET,
    file: 128 * 1024 * 1024,
    entry: 96 * 1024 * 1024,
    total: 256 * 1024 * 1024,
  };
  if (size > budget.file)
    throw Error(
      "Package exceeds the 128 MB preview budget. Open externally to inspect it.",
    );
  const bytes = new Uint8Array(size);
  for (let at = 0; at < size; at += 1048576) {
    checkAbort(context.signal);
    bytes.set(
      await context.source.readRange(at, Math.min(1048576, size - at)),
      at,
    );
  }
  checkAbort(context.signal);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf)
    throw Error(
      "Encrypted Office package or legacy binary format. Password decryption is not supported; open in Office.",
    );
  let entries: Map<string, Uint8Array>;
  if (typeof Worker === "undefined") entries = unpackOffice(bytes, budget);
  else {
    const worker = new Worker(new URL("./package.worker.ts", import.meta.url), {
      type: "module",
    });
    context.onCleanup(() => worker.terminate());
    entries = await new Promise<Map<string, Uint8Array>>((resolve, reject) => {
      const finish = () => {
        context.signal.removeEventListener("abort", abort);
        worker.terminate();
      };
      const abort = () => {
        finish();
        reject(Error("Aborted"));
      };
      context.signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (e) => {
        finish();
        e.data.error
          ? reject(Error(e.data.error))
          : resolve(new Map(e.data.entries));
      };
      worker.onerror = () => {
        finish();
        reject(Error("Office package worker failed."));
      };
      worker.postMessage({ bytes: bytes.buffer, large: true }, [bytes.buffer]);
    });
  }
  checkAbort(context.signal);
  return new OfficePackage(entries, context);
}
