import * as T from "three";
import { GEOMETRY_LIMITS as L } from "./config";
import {
  emptyDocument,
  type GeometryDocumentModel,
  type GeometryData,
} from "./types";
export function validateDocument(doc: GeometryDocumentModel) {
  if (doc.nodes.length > L.nodes || doc.materials.length > L.materials)
    throw Error("Safety limit reached: structure/material count");
  let bytes = 0,
    vertices = 0,
    triangles = 0;
  for (const geometry of doc.geometry) {
    const count = geometry.positions.length / 3;
    if (!Number.isInteger(count)) throw Error("Malformed position array");
    vertices += count;
    triangles +=
      geometry.kind === "mesh"
        ? (geometry.indices?.length ?? geometry.positions.length / 3) / 3
        : 0;
    for (const array of [
      geometry.positions,
      geometry.normals,
      geometry.uvs,
      geometry.colors,
      geometry.indices,
      geometry.segmentOwners,
    ]) {
      if (!array) continue;
      bytes += array.byteLength;
      for (let i = 0; i < array.length; i++)
        if (!Number.isFinite(array[i]))
          throw Error("Non-finite geometry rejected");
    }
    if (geometry.kind === "mesh" && !geometry.normals)
      bytes += geometry.positions.byteLength;
    if ((geometry.brepFaces?.length ?? 0) > L.cadFaces)
      throw Error("CAD face mapping budget reached");
    for (const face of geometry.brepFaces ?? [])
      if (
        !Number.isSafeInteger(face.first) ||
        !Number.isSafeInteger(face.last) ||
        face.first < 0 ||
        face.last < face.first ||
        face.last >=
          (geometry.indices?.length ?? geometry.positions.length / 3) / 3
      )
        throw Error("Invalid CAD face mapping");
    if (geometry.indices)
      for (const index of geometry.indices)
        if (index >= count) throw Error("Invalid geometry index");
  }
  if (vertices > L.vertices || triangles > L.triangles || bytes > L.gpuBytes || bytes > L.cpuBytes)
    throw Error("Safety limit reached: geometry/GPU budget");
  if (!Number.isInteger(triangles)) throw Error("Malformed triangle count");
  doc.metadata = { ...doc.metadata, vertices, triangles, geometryBytes: bytes };
  doc.metadata.unitSource=doc.units==='unknown'?'Unspecified; measurements use model units':doc.category==='cad'?'OCCT tessellation output; see sourceUnits':doc.format==='dxf'?'DXF $INSUNITS':doc.format==='gltf'||doc.format==='glb'?'glTF 2.0 specification':'Source metadata';
  for (const m of doc.materials)
    if (
      [
        ...(m.color ?? []),
        m.opacity ?? 1,
        m.roughness ?? 1,
        m.metalness ?? 0,
        m.alphaTest ?? 0,
      ].some((v) => !Number.isFinite(v))
    )
      throw Error("Invalid material values");
  const nodeBounds = new Map<string, T.Box3>();
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  if(nodes.size!==doc.nodes.length)throw Error('Duplicate scene node identity');
  const state=new Map<string,number>();
  const visit=(id:string,depth:number)=>{const node=nodes.get(id);if(!node)throw Error('Missing parent node');if(depth>L.depth||state.get(id)===1)throw Error('Recursive/deep scene rejected');if(state.get(id)===2)return;state.set(id,1);if(node.parentId)visit(node.parentId,depth+1);state.set(id,2);};
  for(const node of doc.nodes){visit(node.id,0);for(const child of node.children)if(nodes.get(child)?.parentId!==node.id)throw Error('Inconsistent scene child reference');}
  const bounds = new T.Box3();
  for (const node of doc.nodes) {
    if (
      node.transform.length !== 16 ||
      node.transform.some((v) => !Number.isFinite(v))
    )
      throw Error("Invalid node transform");
    if (node.geometryRef === undefined) continue;
    const g = doc.geometry[node.geometryRef];
    if (!g) throw Error("Missing geometry reference");
    const matrix = new T.Matrix4().fromArray(node.transform);
    let parent = node.parentId,
      depth = 0;
    while (parent) {
      if (++depth > L.depth) throw Error("Recursive/deep scene rejected");
      const p = nodes.get(parent);
      if (!p) throw Error("Missing parent node");
      matrix.premultiply(new T.Matrix4().fromArray(p.transform));
      parent = p.parentId;
    }
    const origin = new T.Vector3(...(g.origin ?? [0, 0, 0]));
    const point = new T.Vector3(),
      ownBounds = new T.Box3();
    for (let i = 0; i < g.positions.length; i += 3) {
      point.fromArray(g.positions, i).add(origin).applyMatrix4(matrix);
      if (![point.x, point.y, point.z].every(Number.isFinite))
        throw Error("Invalid transformed coordinates");
      if (
        Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) > 1e30
      )
        throw Error("Coordinate magnitude exceeds viewport budget");
      bounds.expandByPoint(point);
      ownBounds.expandByPoint(point);
    }
    if (!ownBounds.isEmpty()) {
      let current: typeof node | undefined = node,
        depth = 0;
      while (current && depth++ <= L.depth) {
        const accumulated = nodeBounds.get(current.id) ?? new T.Box3();
        accumulated.union(ownBounds);
        nodeBounds.set(current.id, accumulated);
        current = current.parentId ? nodes.get(current.parentId) : undefined;
      }
    }
  }
  for (const [id, b] of nodeBounds) {
    const n = nodes.get(id)!;
    n.metadata.bounds = { min: b.min.toArray(), max: b.max.toArray() };
    n.metadata.dimensions = b.getSize(new T.Vector3()).toArray();
  }
  for (const label of doc.labels ?? []) {
    if (
      !label.position.every(Number.isFinite) ||
      !Number.isFinite(label.height) ||
      label.height <= 0 ||
      !Number.isFinite(label.rotation) ||
      label.height > 1e30 ||
      label.position.some((v) => Math.abs(v) > 1e30)
    )
      throw Error("Invalid drawing text coordinates");
    bounds.expandByPoint(new T.Vector3(...label.position));
    bounds.expandByPoint(
      new T.Vector3(...label.position).add(
        new T.Vector3(label.height * 4, label.height, 0),
      ),
    );
  }
  if (!bounds.isEmpty())
    doc.bounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  doc.capabilities = {
    preview:
      doc.geometry.some((g) => g.positions.length > 0) || !!doc.labels?.length,
    structure: !!doc.nodes.length,
    measure: doc.geometry.some((g) => g.positions.length > 0),
  };
  return doc;
}
export function fromThree(
  root: T.Object3D,
  format: string,
  category: GeometryDocumentModel["category"],
) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if ((o as T.SkinnedMesh).isSkinnedMesh)
      (o as T.SkinnedMesh).skeleton.update();
  });
  const doc = emptyDocument(format, category),
    materialIds = new Map<T.Material, number>();
  let index = 0;
  function material(m: T.Material) {
    if (materialIds.has(m)) return materialIds.get(m)!;
    const id = doc.materials.length;
    if (id >= L.materials) throw Error("Material budget reached");
    materialIds.set(m, id);
    const value = m as T.MeshStandardMaterial;
    doc.materials.push({
      name: m.name,
      color: value.color?.toArray(),
      metalness: value.metalness,
      roughness: value.roughness,
      opacity: m.opacity,
      doubleSided: m.side === T.DoubleSide,
      transparent: m.transparent,
      alphaTest: m.alphaTest,
      image:
        typeof ImageBitmap !== "undefined" &&
        value.map?.image instanceof ImageBitmap
          ? value.map.image
          : undefined,
    });
    return id;
  }
  const queue: { object: T.Object3D; parent: string | null; depth: number }[] =
    [{ object: root, parent: null, depth: 0 }];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { object, parent, depth } = queue[cursor];
    if (cursor >= L.nodes || depth > L.depth)
      throw Error("Scene structure budget reached");
    const id = `node-${index++}`,
      node = {
        id,
        name: object.name || `Object ${index}`,
        type: object.type.toLowerCase(),
        parentId: parent,
        children: [] as string[],
        transform: object.matrix.toArray(),
        materialRefs: [] as number[],
        visible: object.visible,
        metadata: { sourceName: object.name } as Record<string, unknown>,
        geometryRef: undefined as number | undefined,
      };
    object.updateMatrix();
    node.transform = object.matrix.toArray();
    if ((object as T.Mesh).geometry) {
      const mesh = object as T.Mesh,
        geometry = mesh.geometry;
      const positions = geometry.getAttribute("position");
      if (positions) {
        const data: GeometryData = {
          positions: new Float32Array(positions.count * 3),
          kind:
            object instanceof T.Points
              ? "points"
              : object instanceof T.Line
                ? "lines"
                : "mesh",
          indices: geometry.index
            ? new Uint32Array(geometry.index.array)
            : undefined,
          groups: geometry.groups.map((g) => ({
            start: g.start,
            count: g.count,
            materialIndex: g.materialIndex ?? 0,
          })),
        };
        for (let i = 0; i < positions.count; i++) {
          const vertex = mesh.isMesh
            ? mesh.getVertexPosition(i, new T.Vector3())
            : new T.Vector3().fromBufferAttribute(positions, i);
          data.positions.set(vertex.toArray(), i * 3);
        }
        for (const [name, key] of [
          ["normal", "normals"],
          ["uv", "uvs"],
          ["color", "colors"],
        ] as const) {
          const attr = geometry.getAttribute(name);
          if (attr) {
            const size = name === "uv" ? 2 : 3,
              values = new Float32Array(attr.count * size);
            for (let i = 0; i < attr.count; i++) {
              values[i * size] = attr.getX(i);
              values[i * size + 1] = attr.getY(i);
              if (size === 3) values[i * size + 2] = attr.getZ(i);
            }
            data[key] = values;
          }
        }
        node.geometryRef = doc.geometry.length;
        doc.geometry.push(data);
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        node.materialRefs = mats.filter(Boolean).map(material);
        node.metadata = {
          ...node.metadata,
          vertices: positions.count,
          triangles:
            data.kind === "mesh"
              ? (data.indices?.length ?? positions.count) / 3
              : 0,
          normals: !!data.normals,
          uvs: !!data.uvs,
          colors: !!data.colors,
        };
      }
    }
    doc.nodes.push(node);
    for (const child of object.children) {
      queue.push({ object: child, parent: id, depth: depth + 1 });
    }
  }
  const map = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const node of doc.nodes)
    if (node.parentId) map.get(node.parentId)!.children.push(node.id);
  return validateDocument(doc);
}
export function transferableDocument(doc: GeometryDocumentModel) {
  const items = new Set<Transferable>();
  for (const g of doc.geometry)
    for (const b of [
      g.positions,
      g.normals,
      g.indices,
      g.uvs,
      g.colors,
      g.segmentOwners,
    ])
      if (b) items.add(b.buffer as ArrayBuffer);
  for (const m of doc.materials) if (m.image) items.add(m.image);
  return [...items];
}
