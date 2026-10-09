import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import { GEOMETRY_LIMITS as L, geometryCategory } from "./config";
import { emptyDocument, identity, type GeometryDocumentModel } from "./types";
import { GeometryResourceResolver, boundedBytes } from "./resource-resolver";
import { validateDocument } from "./adapter";
import { acquireGeometryDecode } from './decode-budget';
export class GeometryModel {
  ready?: Promise<void>;
  document: GeometryDocumentModel;
  selected?: string;
  quality = "normal";
  private job?: AbortController;
  private cleanupJob = () => {};
  private closed = false;
  private active = true;
  setActive(active: boolean) {
    if(this.closed||this.active===active)return;
    this.active=active;
    if(!active){this.job?.abort();this.cleanupJob();this.ready=undefined;this.document=emptyDocument(this.context.file.detectedType,geometryCategory(this.context.file.detectedType));this.progress='Paused';this.emit();}
    else this.reload();
  }
  reload(quality = this.quality) {
    if(this.closed||!this.active)return;
    this.job?.abort();
    this.cleanupJob();
    const job = new AbortController(),
      cleanups: (() => void)[] = [];
    this.job = job;
    this.quality = quality;
    this.selected = undefined;
    this.cleanupJob = () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
    this.document = emptyDocument(
      this.context.file.detectedType,
      geometryCategory(this.context.file.detectedType),
    );
    this.progress = "Loading model…";
    this.emit();
    const context = {
      ...this.context,
      signal: job.signal,
      onCleanup: (cleanup: () => void) => {
        if (job.signal.aborted) cleanup();
        else cleanups.push(cleanup);
      },
    };
    this.ready = loadGeometry(context, quality, (p) => {
      if (!job.signal.aborted) {
        this.progress = p;
        this.emit();
      }
    })
      .then((result) => {
        if (!job.signal.aborted) {
          this.document = result.document;
          this.progress = "";
          this.emit();
        }
      })
      .catch((error) => { if(!job.signal.aborted&&!this.closed){this.document.error=String(error);this.progress='';this.emit();} });
  }
  progress = "Loading model…";
  private listeners = new Set<() => void>();
  private revision = 0;
  constructor(readonly context: ViewerContext) {
    context.onCleanup(() => {
      this.closed=true;
      this.job?.abort();
      this.cleanupJob();
      this.ready=undefined;
      this.document=emptyDocument(context.file.detectedType,geometryCategory(context.file.detectedType));
      this.listeners.clear();
    });
    this.document = emptyDocument(
      context.file.detectedType,
      geometryCategory(context.file.detectedType),
    );
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
  select(id?: string) {
    this.selected = id;
    this.emit();
  }
}
function gltfHeader(bytes: Uint8Array, format: string) {
  if (format === "gltf") return JSON.parse(new TextDecoder().decode(bytes));
  if (bytes.length < 20) throw Error("Truncated GLB");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== bytes.length ||
    v.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("Malformed GLB header");
  const len = v.getUint32(12, true);
  if (len > bytes.length - 20) throw Error("Invalid GLB JSON chunk");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
}
export function validateGltf(json: any) {
  if (json.asset?.version !== "2.0") throw Error("Only glTF 2.0 is available");
  const nonnegative=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
  let allocated=0;
  for(const buffer of json.buffers??[]){if(!nonnegative(buffer.byteLength)||buffer.byteLength>L.resourceBytes)throw Error('Invalid glTF buffer length');}
  for(const view of json.bufferViews??[]){
    const buffer=json.buffers?.[view.buffer],offset=view.byteOffset??0;
    if(!nonnegative(view.buffer)||!buffer||!nonnegative(offset)||!nonnegative(view.byteLength)||!Number.isSafeInteger(offset+view.byteLength)||offset+view.byteLength>buffer.byteLength)throw Error('Invalid glTF BufferView');
    if(view.byteStride!==undefined&&(!nonnegative(view.byteStride)||view.byteStride<4||view.byteStride>252||view.byteStride%4))throw Error('Invalid glTF interleaved stride');
  }
  const widths:Record<string,number>={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const components:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  for(const accessor of json.accessors??[]){
    if(!nonnegative(accessor.count)||accessor.count>L.vertices)throw Error('Unsafe glTF accessor count');
    const width=widths[accessor.componentType],parts=components[accessor.type],offset=accessor.byteOffset??0;
    if(!width||!parts||!nonnegative(accessor.count)||!nonnegative(offset)||offset%width)throw Error('Invalid glTF accessor datatype or offset');
    const packed=width*parts,stride=accessor.bufferView===undefined?packed:json.bufferViews?.[accessor.bufferView]?.byteStride??packed;
    if(stride<packed)throw Error('Invalid glTF accessor stride');
    if(accessor.bufferView!==undefined){const view=json.bufferViews?.[accessor.bufferView];if(!view||!nonnegative(accessor.bufferView)||offset+(accessor.count?((accessor.count-1)*stride+packed):0)>view.byteLength)throw Error('glTF accessor exceeds BufferView');}
    allocated+=accessor.count*parts*Math.max(width,4);
    if(!Number.isSafeInteger(allocated)||allocated>L.cpuBytes)throw Error('glTF decoded accessor CPU budget exceeded');
    if(accessor.sparse){const sparse=accessor.sparse;if(!nonnegative(sparse.count)||sparse.count>accessor.count)throw Error('Invalid sparse accessor count');for(const [spec,n] of [[sparse.indices,widths[sparse.indices?.componentType]],[sparse.values,packed]] as const){const view=json.bufferViews?.[spec?.bufferView],at=spec?.byteOffset??0;if(!spec||!view||!nonnegative(at)||!n||at+sparse.count*n>view.byteLength)throw Error('Invalid sparse accessor range');}if(![5121,5123,5125].includes(sparse.indices.componentType))throw Error('Invalid sparse index type');}
  }
  if (
    (json.nodes?.length ?? 0) > L.nodes ||
    (json.materials?.length ?? 0) > L.materials ||
    (json.images?.length ?? 0) > L.textures
  )
    throw Error("glTF scene budget exceeded");
  for (const accessor of json.accessors ?? [])
    if (
      !Number.isSafeInteger(accessor.count) ||
      accessor.count < 0 ||
      accessor.count > L.vertices
    )
      throw Error("Unsafe glTF accessor count");
  if (
    (json.animations ?? []).some((a: any) => (a.channels?.length ?? 0) > 4096)
  )
    throw Error("Animation metadata budget exceeded");
  for (const node of json.nodes ?? [])
    for (const key of ["matrix", "translation", "rotation", "scale"])
      if (
        node[key] &&
        (!Array.isArray(node[key]) ||
          node[key].some((v: any) => !Number.isFinite(v)))
      )
        throw Error("Invalid glTF transform");
  const nodes = json.nodes ?? [],
    state = new Uint8Array(nodes.length);
  function visit(id: number, depth: number) {
    if (!Number.isInteger(id) || id < 0 || id >= nodes.length)
      throw Error("Invalid scene node reference");
    if (depth > L.depth || state[id] === 1)
      throw Error("Recursive or deep glTF scene");
    if (state[id] === 2) return;
    state[id] = 1;
    for (const child of nodes[id].children ?? []) visit(child, depth + 1);
    state[id] = 2;
  }
  for (let i = 0; i < nodes.length; i++) visit(i, 0);
  for (const extension of [
    "KHR_draco_mesh_compression",
    "EXT_meshopt_compression",
    "KHR_texture_basisu",
  ])
    if (json.extensionsUsed?.includes(extension))
      throw Error(`${extension} detected. Decoder unavailable in this build.`);
}
export async function loadGeometry(
  context: ViewerContext,
  quality = "normal",
  onProgress?: (value: string) => void,
) {
  const model = new GeometryModel(context),
    format = context.file.detectedType,
    resolver = new GeometryResourceResolver(context),
    category = geometryCategory(format);
  const supported = [
    "stl",
    "obj",
    "ply",
    "gltf",
    "glb",
    "step",
    "stp",
    "iges",
    "igs",
    "dxf",
  ];
  if (!supported.includes(format)) {
    if (format === "dwg" || format === "fbx")
      try {
        const size = await context.source.getSize(),
          header = await context.source.readRange(0, Math.min(size, 64));
        checkAbort(context.signal);
        if (format === "dwg" && /^AC10/.test(new TextDecoder().decode(header)))
          model.document.metadata.headerVersion = new TextDecoder().decode(
            header.subarray(0, 6),
          );
        if (
          format === "fbx" &&
          header.length >= 27 &&
          new TextDecoder()
            .decode(header.subarray(0, 20))
            .startsWith("Kaydara FBX Binary")
        )
          model.document.metadata.binaryVersion = new DataView(
            header.buffer,
            header.byteOffset,
            header.byteLength,
          ).getUint32(23, true);
      } catch (error) {
        checkAbort(context.signal);
        model.document.diagnostics.push(String(error));
      }
    model.document.error = `${format.toUpperCase()} detected. A reliable preview backend is unavailable in this build. Use Open externally or Inspect.`;
    return model;
  }
  let worker: Worker | undefined;
  const releaseDecode = await acquireGeometryDecode(context.signal);
  const bitmaps = new Set<ImageBitmap>();
  context.onCleanup(() => {
    worker?.terminate();
    for (const image of bitmaps) image.close();
  });
  try {
    const metadata: Record<string, unknown> = {};
    let reduced = false;
    let bytes: Uint8Array;
    const size = await context.source.getSize();
    const head =
      format === "stl" && size >= 84
        ? await context.source.readRange(0, 84)
        : undefined;
    const count = head
      ? new DataView(head.buffer, head.byteOffset, 84).getUint32(80, true)
      : 0;
    if (head && 84 + count * 50 === size && count > L.triangles) {
      const preview = Math.min(200000, count);
      bytes = new Uint8Array(84 + preview * 50);
      bytes.set(head);
      new DataView(bytes.buffer).setUint32(80, preview, true);
      for (let at = 84; at < bytes.length; at += 1024 ** 2) {
        checkAbort(context.signal);
        const part = await context.source.readRange(
          at,
          Math.min(1024 ** 2, bytes.length - at),
        );
        bytes.set(part, at);
      }
      metadata.originalTriangles = count;
      metadata.boundsScope =
        "Reduced preview subset; full-model bounds unavailable";
      reduced = true;
    } else
      bytes = await boundedBytes(
        context.source,
        context.signal,
        category === "cad" ? L.cadBytes : L.fileBytes,
      );
    if (category === "cad") {
      const source = new TextDecoder().decode(bytes);
      if ((source.match(/#\d+\s*=/g) ?? []).length > 250000)
        throw Error("CAD entity count budget reached");
      metadata.sourceUnits = /SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(source)
        ? "mm"
        : /SI_UNIT\(\$,\.METRE\.\)/.test(source)
          ? "m"
          : /CONVERSION_BASED_UNIT\('(?:INCH|inch)'/.test(source)
            ? "inch"
            : "Not explicitly resolved; kernel-normalized output";
    }
    const resources: Record<string, string> = {};
    let mtl: string | undefined;
    const mtlImages: { material: string; path: string }[] = [];
    if (format === "gltf" || format === "glb") {
      const json = gltfHeader(bytes, format);
      validateGltf(json);
      if ((json.nodes?.length ?? 0) > 10000) {
        model.document.metadata = {
          sourceNodes: json.nodes.length,
          geometryPreview: "Limited to 10,000 render nodes",
        };
        model.document.nodes = json.nodes.map((n: any, i: number) => ({
          id: "source-" + i,
          name: n.name || "Node " + i,
          type: "group",
          parentId: null,
          children: (n.children ?? []).map((id: number) => "source-" + id),
          visible: true,
          transform: n.matrix ?? identity(),
          materialRefs: [],
          metadata: { sourceNode: i, mesh: n.mesh },
        }));
        for (const node of model.document.nodes)
          for (const child of node.children) {
            const target = model.document.nodes[Number(child.slice(7))];
            if (target) target.parentId = node.id;
          }
        model.document.capabilities.structure = true;
        model.document.error =
          "Scene structure is available. Geometry preview exceeds the render-node budget.";
        model.progress = "";
        return model;
      }

      metadata.scenes = json.scenes?.length ?? 0;
      metadata.animations = json.animations?.length ?? 0;
      metadata.cameras = json.cameras?.length ?? 0;
      metadata.extensions = json.extensionsUsed ?? [];
      for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
        if (!item.uri) continue;
        try {
          const data = item.uri.startsWith("data:")
            ? resolver.dataUri(item.uri)
            : await resolver.bytes(item.uri);
          const isImage = (json.images ?? []).includes(item);
          if(!isImage&&data.byteLength!==item.byteLength)throw Error('glTF external buffer length differs from declaration');
          const type = isImage
            ? resolver.image(data)
            : "application/octet-stream";
          resources[item.uri] = resolver.url(data, type);
        } catch (error) {
          if ((json.buffers ?? []).includes(item)) throw error;
          resolver.diagnostics.push(String(error));
          resources[item.uri] = resolver.url(
            Uint8Array.from(
              atob(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
              ),
              (c) => c.charCodeAt(0),
            ),
            "image/png",
          );
        }
      }
      // Validate embedded textures before the decoder sees them. Missing/unsupported images keep geometry available.
      const neutral = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      );
      let binary: Uint8Array | undefined;
      if (format === "glb") {
        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
          ),
          at = 20 + view.getUint32(12, true);
        if (at + 8 <= bytes.length) {
          const length = view.getUint32(at, true);
          if (
            view.getUint32(at + 4, true) !== 0x004e4942 ||
            length > bytes.length - at - 8
          )
            throw Error("Malformed GLB binary chunk");
          binary = bytes.slice(at + 8, at + 8 + length);
          const declared=json.buffers?.[0]?.byteLength;
          if(!Number.isSafeInteger(declared)||declared>binary.byteLength||binary.byteLength-declared>3)throw Error('GLB buffer length differs from declaration');
        }
      }
      for (const [i, image] of (json.images ?? []).entries()) {
        if (image.bufferView === undefined) continue;
        try {
          const view = json.bufferViews?.[image.bufferView];
          if (!view) throw Error("Invalid embedded image buffer view");
          const offset = view.byteOffset ?? 0,
            length = view.byteLength;
          if (
            !Number.isSafeInteger(offset) ||
            !Number.isSafeInteger(length) ||
            offset < 0 ||
            length < 0 ||
            length > L.textureBytes
          )
            throw Error("Embedded image range budget reached");
          let buffer = binary;
          if (format !== "glb") {
            const uri = json.buffers?.[view.buffer]?.uri;
            if (!uri || !resources[uri])
              throw Error("Missing approved image buffer");
            buffer = new Uint8Array(
              await (await fetch(resources[uri])).arrayBuffer(),
            );
          }
          if (!buffer || offset + length > buffer.length)
            throw Error("Invalid embedded image range");
          resolver.image(buffer.subarray(offset, offset + length));
        } catch (error) {
          resolver.diagnostics.push("Texture unavailable: " + String(error));
          delete image.bufferView;
          image.uri = "elorin-neutral-" + i;
          image.mimeType = "image/png";
          resources[image.uri] = resolver.url(neutral, "image/png");
        }
      }
      for (const texture of json.textures ?? [])
        if (texture.extensions?.KHR_texture_basisu) {
          texture.source = texture.extensions.KHR_texture_basisu.source;
          delete texture.extensions.KHR_texture_basisu;
        }
      json.extensionsRequired = (json.extensionsRequired ?? []).filter(
        (extension: string) => extension !== "KHR_texture_basisu",
      );
      if (format === "glb" && binary) {
        const uri = "elorin-local-bin";
        json.buffers[0].uri = uri;
        resources[uri] = resolver.url(binary, "application/octet-stream");
      }
      bytes = new TextEncoder().encode(JSON.stringify(json));
      metadata.preparedGltf = true;
    }
    if (format === "obj") {
      const text = new TextDecoder().decode(bytes),
        references = [...text.matchAll(/^mtllib\s+(.+)$/gm)];
      if (references.length > 16)
        throw Error("OBJ material library budget reached");
      const chunks: string[] = [];
      for (const match of references) {
        try {
          const source = new TextDecoder().decode(
            await resolver.bytes(match[1].trim(), L.textureBytes),
          );
          chunks.push(
            source.replace(/^\s*(map_\S+|bump|disp|decal)\s+.*$/gm, ""),
          );
          let material = "";
          const base = match[1].trim().split("/").slice(0, -1).join("/");
          for (const line of source.split(/\r?\n/)) {
            const name = /^newmtl\s+(.+)$/.exec(line.trim());
            if (name) material = name[1];
            const texture = /^map_Kd\s+(.+)$/.exec(line.trim());
            if (texture)
              mtlImages.push({
                material,
                path: [base, texture[1]].filter(Boolean).join("/"),
              });
          }
          if (mtlImages.length > L.textures)
            throw Error("Texture count budget reached");
          metadata.materialLibraries = references.map((r) => r[1]);
        } catch (error) {
          resolver.diagnostics.push(String(error));
        }
      }
      mtl = chunks.join("\n");
    }
    checkAbort(context.signal);
    worker =
      category === "cad"
        ? new Worker(new URL("/vendor/occt/cad-worker.js", location.href))
        : new Worker(new URL("./parser.worker.ts", import.meta.url), {
            type: "module",
          });
    const result = await new Promise<any>((resolve, reject) => {
      const abort = () => {
        finish();
        worker!.terminate();
        reject(Error("Cancelled"));
      };
      context.signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => {
        finish();
        worker!.terminate();
        reject(Error("Parser time budget reached"));
      }, L.workerTimeout);
      const finish = () => {
        clearTimeout(timer);
        context.signal.removeEventListener("abort", abort);
      };
      worker!.onmessage = (e) => {
        if (e.data.progress) {
          model.progress = e.data.progress;
          onProgress?.(model.progress);
          model.emit();
          return;
        }
        finish();
        e.data.error
          ? reject(Error(e.data.error))
          : resolve(e.data.document ?? e.data.cad);
      };
      worker!.onerror = () => {
        finish();
        reject(Error("Geometry parser failed"));
      };
      worker!.postMessage(
        {
          format,
          bytes: bytes.buffer,
          resources,
          mtl,
          metadata,
          quality,
          limits: {
            vertices: L.vertices,
            indices: L.triangles * 3,
            faces: L.cadFaces,
          },
        },
        [bytes.buffer],
      );
    });
    worker.terminate();
    worker = undefined;
    if (context.signal.aborted) {
      for (const material of result.materials ?? []) material.image?.close();
      checkAbort(context.signal);
    }
    if (category === "cad") {
      const doc = emptyDocument(format, category);
      doc.units = "mm";
      doc.metadata = {
        ...metadata,
        outputUnits: "OCCT coordinates normalized to millimeters",
        kernel: "OpenCascade via occt-import-js",
        measurement: "Approximate tessellated surface",
        quality,
      };
      doc.geometry = result.meshes.map((m: any) => ({
        positions: m.positions,
        normals: m.normals,
        indices: m.indices,
        kind: "mesh",
        brepFaces: m.faces,
        origin: m.origin,
      }));
      doc.materials = result.meshes.map((m: any) => ({
        name: m.name,
        color: m.color,
      }));
      const queue = [
        { source: result.root, parent: null as string | null, depth: 0 },
      ];
      for (let at = 0; at < queue.length; at++) {
        const { source, parent, depth } = queue[at];
        if (at >= L.nodes || depth > L.depth)
          throw Error("CAD assembly structure budget reached");
        const id = `assembly-${at}`,
          node = {
            id,
            name: source.name || `Assembly ${at + 1}`,
            type: source.children?.length ? "assembly" : "part",
            parentId: parent,
            children: [] as string[],
            visible: true,
            transform: identity(),
            materialRefs: [],
            metadata: { sourceName: source.name },
          };
        doc.nodes.push(node);
        for (const ref of source.meshes ?? []) {
          if (!result.meshes[ref]) throw Error("Invalid CAD mesh reference");
          doc.nodes.push({
            id: `body-${doc.nodes.length}`,
            name: result.meshes[ref].name || `Body ${ref + 1}`,
            type: "body",
            parentId: id,
            children: [],
            visible: true,
            transform: identity(),
            geometryRef: ref,
            materialRefs: [ref],
            metadata: {
              brepFaceCount: result.meshes[ref].faces?.length ?? 0,
              vertices: result.meshes[ref].positions.length / 3,
              triangles: result.meshes[ref].indices.length / 3,
              measurement: "Tessellated approximation",
            },
          });
        }
        for (const child of source.children ?? [])
          queue.push({ source: child, parent: id, depth: depth + 1 });
      }
      const map = new Map(doc.nodes.map((n) => [n.id, n]));
      for (const n of doc.nodes)
        if (n.parentId) map.get(n.parentId)?.children.push(n.id);
      model.document = validateDocument(doc);
    } else model.document = result;
    model.document.reduced = reduced;
    if (reduced)
      model.document.diagnostics.push(
        "Reduced preview: first 200,000 triangles. Measurements and bounds describe the visible subset.",
      );
    for (const material of model.document.materials)
      if (material.image) bitmaps.add(material.image);
    for (const spec of mtlImages) {
      try {
        const data = await resolver.bytes(spec.path, L.textureBytes);
        const type = resolver.image(data),
          bitmap = await createImageBitmap(
            new Blob([data.buffer as ArrayBuffer], { type }),
            { imageOrientation: "flipY" },
          );
        if (context.signal.aborted) {
          bitmap.close();
          checkAbort(context.signal);
        }
        bitmaps.add(bitmap);
        const material = model.document.materials.find(
          (m) => m.name === spec.material,
        );
        if (material) material.image = bitmap;
      } catch (error) {
        checkAbort(context.signal);
        resolver.diagnostics.push("Texture unavailable: " + String(error));
      }
    }
    const textureGpuBytes = model.document.materials.reduce(
      (sum, m) =>
        sum + (m.image ? (m.image.width * m.image.height * 4 * 4) / 3 : 0),
      0,
    );
    if (
      Number(model.document.metadata.geometryBytes ?? 0) + textureGpuBytes >
      L.gpuBytes
    )
      throw Error("Combined geometry and texture GPU budget reached");
    model.document.metadata.textureGpuBytes = Math.ceil(textureGpuBytes);
    model.document.diagnostics.push(...resolver.diagnostics);
    model.progress = "";
    return model;
  } catch (error) {
    checkAbort(context.signal);
    model.document.geometry = [];
    model.document.materials = [];
    model.document.capabilities.preview = false;
    model.document.capabilities.measure = false;
    model.document.error =
      error instanceof Error ? error.message : String(error);
    model.progress = "";
    worker?.terminate();
    for (const bitmap of bitmaps) bitmap.close();
    bitmaps.clear();
    return model;
  } finally {
    releaseDecode();
    resolver.dispose();
  }
}
