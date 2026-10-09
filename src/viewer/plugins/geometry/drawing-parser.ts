import DxfParser from "dxf-parser";
import * as T from "three";
import { NURBSCurve } from "three/addons/curves/NURBSCurve.js";
import { GEOMETRY_LIMITS as L } from "./config";
import { emptyDocument, identity, type Vec3 } from "./types";
import { validateDocument } from "./adapter";
type Entity = Record<string, any>;
export function parseDrawing(text: string) {
  if (
    text.length > L.fileBytes ||
    !/^\s*0\s*[\r\n]+SECTION/m.test(text) ||
    !text.includes("EOF")
  )
    throw Error("Malformed or truncated DXF");
  const parsed = new DxfParser().parseSync(text);
  if (!parsed) throw Error("Malformed DXF");
  const dxf = parsed as any;
  const doc = emptyDocument("dxf", "drawing");
  const entities = dxf.entities as Entity[];
  const sourceEntities:Record<string,number>={};
  let section='',sectionName=false;
  const sourceLines=text.split(/\r?\n/);
  for(let i=0;i+1<sourceLines.length;i+=2){const code=Number(sourceLines[i].trim()),value=sourceLines[i+1].trim();if(code===0&&value==='SECTION')sectionName=true;else if(code===2&&sectionName){section=value;sectionName=false;}else if(code===0&&value==='ENDSEC')section='';else if(code===0&&['ENTITIES','BLOCKS'].includes(section)&&!['BLOCK','ENDBLK','SEQEND','VERTEX'].includes(value))sourceEntities[value]=(sourceEntities[value]??0)+1;}
  // dxf-parser omits extrusion for CIRCLE/ARC; retain raw group codes before rendering.
  const rawAxes: { type:string;handle?:string;x?:number;y?:number;z?:number;used?:boolean }[]=[];
  const lines=text.split(/\r?\n/);let raw:typeof rawAxes[number]|undefined;
  for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim()),value=lines[i+1].trim();if(code===0){if(raw)rawAxes.push(raw);raw={type:value};}else if(raw){if(code===5)raw.handle=value;if(code===210)raw.x=Number(value);if(code===220)raw.y=Number(value);if(code===230)raw.z=Number(value);}}
  if(raw)rawAxes.push(raw);
  const axesByHandle=new Map(rawAxes.filter(a=>a.handle).map(a=>[a.handle,a]));
  const axesByType=new Map<string,typeof rawAxes>();const axesCursor=new Map<string,number>();
  for(const axis of rawAxes){const list=axesByType.get(axis.type)??[];list.push(axis);axesByType.set(axis.type,list);}
  for(const entity of [...Object.values(dxf.blocks??{}).flatMap((b:any)=>b.entities??[]),...entities]){
    const cursor=axesCursor.get(entity.type)??0,list=axesByType.get(entity.type);axesCursor.set(entity.type,cursor+1);
    const axis=entity.handle?axesByHandle.get(entity.handle):list?.[cursor];
    if(axis){if(axis.x!==undefined)entity.extrusionDirectionX=axis.x;if(axis.y!==undefined)entity.extrusionDirectionY=axis.y;if(axis.z!==undefined)entity.extrusionDirectionZ=axis.z;}
  }
  for (const match of text.matchAll(/^[ \t]*0\r?\nHATCH\r?\n/gm)) {
    const pairs = [] as { code: number; value: string }[];
    let cursor = match.index! + match[0].length;
    while (cursor < text.length) {
      const codeEnd = text.indexOf("\n", cursor);
      if (codeEnd < 0) break;
      const valueEnd = text.indexOf("\n", codeEnd + 1);
      if (valueEnd < 0) break;
      const code = Number(text.slice(cursor, codeEnd).trim()),
        value = text.slice(codeEnd + 1, valueEnd).trim();
      cursor = valueEnd + 1;
      if (code === 0) break;
      pairs.push({ code, value });
      if (pairs.length > 1000000) throw Error("HATCH boundary budget exceeded");
    }
    const loops: Entity[][] = [];
    let loop: Entity[] | undefined;
    let current: Entity | undefined;
    let unsupported = false;
    for (const pair of pairs) {
      if (pair.code === 92) {
        if ((Number(pair.value) & 2) === 0) {
          unsupported = true;
          break;
        }
        loop = [];
        loops.push(loop);
      } else if (pair.code === 10 && loop) {
        current = { x: Number(pair.value), y: 0 };
        loop.push(current);
      } else if (pair.code === 20 && current) current.y = Number(pair.value);
      else if (pair.code === 42 && Number(pair.value) !== 0) unsupported = true;
    }
    if (!unsupported && loops.length)
      entities.push({
        type: "HATCH",
        layer: pairs.find((p) => p.code === 8)?.value ?? "0",
        handle: pairs.find((p) => p.code === 5)?.value,
        loops,
      });
    else
      doc.diagnostics.push(
        "HATCH boundary type unavailable; no pattern inferred",
      );
  }
  if (entities.some((e) => e.type === "HATCH"))
    doc.diagnostics.push(
      "HATCH boundary preview; pattern fill is not rendered",
    );
  if (entities.length > L.nodes) throw Error("DXF entity budget exceeded");
  const units: Record<number, string> = {
    0: "unknown",
    1: "inch",
    2: "ft",
    4: "mm",
    5: "cm",
    6: "m",
  };
  doc.units = units[dxf.header?.$INSUNITS] ?? "unknown";
  doc.metadata = {
    version: dxf.header?.$ACADVER,
    entities: entities.length,
    blocks: Object.keys(dxf.blocks ?? {}).length,
    layout: "Model space only; paper-space entities are excluded",
  };
  doc.labels = [];
  const layers = new Map<string, string>();
  const identityMatrix = new T.Matrix4();
  let count = 0;
  const omitted: Record<string,number> = {};
  function layer(name: string, color?: number) {
    if (layers.has(name)) return layers.get(name)!;
    const id = `layer-${layers.size}`;
    layers.set(name, id);
    const definition = (
      dxf.tables?.layer?.layers as Record<string, Entity> | undefined
    )?.[name];
    doc.nodes.push({
      id,
      name,
      type: "layer",
      parentId: null,
      children: [],
      visible: !(definition?.frozen || definition?.visible === false),
      transform: identity(),
      materialRefs: [],
      metadata: { color: color ?? definition?.color },
    });
    return id;
  }
  const point = (p: Entity) => new T.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  const curves = (e: Entity) => {
    const pairs: T.Vector3[][] = [];
    if (e.type === "HATCH") {
      for (const loop of e.loops ?? []) {
        for (let i = 0; i < loop.length; i++)
          pairs.push([point(loop[i]), point(loop[(i + 1) % loop.length])]);
      }
      return pairs;
    }
    if (e.type === "SPLINE") {
      const points = e.controlPoints ?? [],
        degree = e.degreeOfSplineCurve,
        knots = e.knotValues ?? [];
      if (e.rational) {
        doc.diagnostics.push(
          "Rational SPLINE weights unavailable; entity omitted",
        );
        return pairs;
      }
      if (
        degree < 1 ||
        degree > 8 ||
        points.length > 10000 ||
        knots.length !== points.length + degree + 1 ||
        knots.some(
          (v: number, i: number) =>
            !Number.isFinite(v) || (i > 0 && v < knots[i - 1]),
        )
      )
        throw Error("Invalid SPLINE data");
      const curve = new NURBSCurve(
        degree,
        knots,
        points.map((p: Entity) => new T.Vector4(p.x, p.y, p.z ?? 0, 1)),
      );
      const sampled = curve.getPoints(96);
      for (let i = 1; i < sampled.length; i++)
        pairs.push([sampled[i - 1], sampled[i]]);
      return pairs;
    }
    if (["LINE", "LWPOLYLINE", "POLYLINE"].includes(e.type)) {
      const vertices = [...(e.vertices ?? [])] as Entity[];
      if (e.shape && vertices.length > 2) vertices.push(vertices[0]);
      for (let i = 1; i < vertices.length; i++) {
        const a = vertices[i - 1],
          b = vertices[i];
        if (a.bulge) {
          const chord = point(b).sub(point(a)),
            length = chord.length(),
            theta = 4 * Math.atan(a.bulge),
            radius = Math.abs(length / (2 * Math.sin(theta / 2))),
            middle = point(a).add(point(b)).multiplyScalar(0.5),
            normal = new T.Vector3(-chord.y, chord.x, 0).normalize(),
            center = middle.addScaledVector(
              normal,
              (length * (1 - a.bulge * a.bulge)) / (4 * a.bulge),
            ),
            start = Math.atan2(a.y - center.y, a.x - center.x);
          let previous = point(a);
          for (let k = 1; k <= 32; k++) {
            const angle = start + (theta * k) / 32,
              next = new T.Vector3(
                center.x + radius * Math.cos(angle),
                center.y + radius * Math.sin(angle),
                a.z ?? 0,
              );
            pairs.push([previous, next]);
            previous = next;
          }
        } else pairs.push([point(a), point(b)]);
      }
    } else if (["CIRCLE", "ARC", "ELLIPSE"].includes(e.type)) {
      const center = point(e.center),
        start = e.startAngle ?? 0,
        end = e.endAngle ?? Math.PI * 2,
        span = end >= start ? end - start : end - start + Math.PI * 2;
      let previous: T.Vector3 | undefined;
      for (let i = 0; i <= 96; i++) {
        const angle = start + (span * i) / 96;
        let p: T.Vector3;
        if (e.type === "ELLIPSE") {
          const major = point(e.majorAxisEndPoint),
            minor = new T.Vector3(-major.y, major.x, 0).multiplyScalar(
              e.axisRatio ?? 1,
            );
          p = center
            .clone()
            .addScaledVector(major, Math.cos(angle))
            .addScaledVector(minor, Math.sin(angle));
        } else
          p = center
            .clone()
            .add(
              new T.Vector3(
                Math.cos(angle) * (e.radius ?? 0),
                Math.sin(angle) * (e.radius ?? 0),
                0,
              ),
            );
        if (previous) pairs.push([previous, p]);
        previous = p;
      }
    } else if (e.type === "POINT") {
      const p = point(e.position),
        s = 0.02;
      pairs.push(
        [
          p.clone().add(new T.Vector3(-s, 0, 0)),
          p.clone().add(new T.Vector3(s, 0, 0)),
        ],
        [
          p.clone().add(new T.Vector3(0, -s, 0)),
          p.clone().add(new T.Vector3(0, s, 0)),
        ],
      );
    }
    return pairs;
  };
  function append(
    e: Entity,
    parent: string,
    transform: T.Matrix4,
    depth: number,
    ancestry: Set<string>,
    inheritedLayer = "0",
  ) {
    if (++count > L.nodes || depth > 32)
      throw Error("DXF block/entity expansion budget reached");
    if (e.inPaperSpace) return;
    if (
      (e.extrusionDirectionX ?? 0) !== 0 ||
      (e.extrusionDirectionY ?? 0) !== 0 ||
      (e.extrusionDirectionZ ?? 1) !== 1
    ) {
      const normal=new T.Vector3(e.extrusionDirectionX??0,e.extrusionDirectionY??0,e.extrusionDirectionZ??1);
      if(![normal.x,normal.y,normal.z].every(Number.isFinite)||normal.lengthSq()===0)throw Error('Invalid DXF extrusion axis');
      normal.normalize();
      if(['CIRCLE','ARC','LWPOLYLINE','INSERT'].includes(e.type)){
        const x=(Math.abs(normal.x)<1/64&&Math.abs(normal.y)<1/64?new T.Vector3(0,1,0):new T.Vector3(0,0,1)).cross(normal).normalize(),y=normal.clone().cross(x);
        transform=transform.clone().multiply(new T.Matrix4().makeBasis(x,y,normal));
      }else if(e.type!=='LINE'){
        omitted[`${e.type}:non-XY OCS`]=(omitted[`${e.type}:non-XY OCS`]??0)+1;
        return;
      }
    }
    const layerName =
      (e.layer ?? "0") === "0" && depth > 0 ? inheritedLayer : (e.layer ?? "0");
    layer(layerName);
    const id = `entity-${count}`,
      node = {
        id,
        name: e.handle ? `${e.type} ${e.handle}` : `${e.type} ${count}`,
        type: e.type.toLowerCase(),
        parentId: parent,
        children: [] as string[],
        visible: true,
        transform: identity(),
        materialRefs: [] as number[],
        metadata: {
          layer: layerName,
          entityType: e.type,
          sourceHandle: e.handle,
          radius: e.radius,
        } as Record<string, unknown>,
        geometryRef: undefined as number | undefined,
      };
    doc.nodes.push(node);
    if (e.type === "INSERT" || e.type === "DIMENSION") {
      const name = e.name ?? e.block,
        block = (dxf.blocks as Record<string, Entity> | undefined)?.[name];
      if (block) {
        if (ancestry.has(name)) throw Error("Recursive DXF block reference");
        const next = new Set(ancestry);
        next.add(name);
        const position = point(e.position ?? {}),
          base = point(block.position ?? {});
        const local = new T.Matrix4()
          .compose(
            position,
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(0, 0, 1),
              ((e.rotation ?? 0) * Math.PI) / 180,
            ),
            new T.Vector3(e.xScale ?? 1, e.yScale ?? 1, e.zScale ?? 1),
          )
          .multiply(new T.Matrix4().makeTranslation(-base.x, -base.y, -base.z));
        node.metadata.block = name;
        node.metadata.sourceTransform = transform
          .clone()
          .multiply(local)
          .toArray();
        for (const child of block.entities ?? [])
          append(
            child,
            id,
            transform.clone().multiply(local),
            depth + 1,
            next,
            layerName,
          );
      } else doc.diagnostics.push(`${e.type}: referenced block unavailable`);
      return;
    }
    if (e.type === "TEXT" || e.type === "MTEXT") {
      const p = point(e.startPoint ?? e.position ?? {}).applyMatrix4(transform);
      doc.labels!.push({
        text: String(e.text ?? "")
          .replace(/\\P/g, "\n")
          .replace(/\\[A-Za-z][^;]*;/g, ""),
        position: p.toArray() as Vec3,
        height:
          (e.textHeight ?? e.height ?? 1) *
          Math.hypot(
            transform.elements[4],
            transform.elements[5],
            transform.elements[6],
          ),
        rotation:
          ((e.rotation ?? 0) * Math.PI) / 180 +
          Math.atan2(transform.elements[1], transform.elements[0]),
        nodeId: id,
      });
      return;
    }
    const pairs = curves(e);
    if (!pairs.length) {
      omitted[e.type]=(omitted[e.type]??0)+1;
      if (doc.diagnostics.length < 100)
        doc.diagnostics.push(
          `${e.type} entity has no reliable geometry preview`,
        );
      return;
    }
    const origin = pairs[0][0].clone().applyMatrix4(transform);
    const values = new Float32Array(pairs.length * 6);
    let at = 0;
    for (const pair of pairs)
      for (const p of pair) {
        values.set(p.clone().applyMatrix4(transform).sub(origin).toArray(), at);
        at += 3;
      }
    const bound = new T.Box3();
    for (let i = 0; i < values.length; i += 3)
      bound.expandByPoint(new T.Vector3().fromArray(values, i).add(origin));
    node.metadata.bounds = {
      min: bound.min.toArray(),
      max: bound.max.toArray(),
    };
    node.geometryRef = doc.geometry.length;
    doc.geometry.push({
      positions: values,
      kind: "lines",
      origin: origin.toArray() as Vec3,
    });
    const color =
      e.color ??
      (dxf.tables?.layer?.layers as Record<string, Entity> | undefined)?.[
        layerName
      ]?.color ??
      0x8599aa;
    const key = String(color);
    let material = doc.materials.findIndex((m) => m.name === key);
    if (material < 0) {
      material = doc.materials.length;
      doc.materials.push({ name: key, color: new T.Color(color).toArray() });
    }
    node.materialRefs = [material];
  }
  for (const e of entities)
    append(e, layer(e.layer ?? "0"), identityMatrix, 0, new Set());
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const n of doc.nodes)
    if (n.parentId) nodes.get(n.parentId)?.children.push(n.id);
  doc.metadata.layers = layers.size;
  const groups = new Map<string, typeof doc.nodes>();
  for (const node of doc.nodes) {
    if (node.geometryRef === undefined) continue;
    const key = String(node.metadata.layer) + ":" + node.materialRefs[0];
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(node);
  }
  const nodeIndices = new Map(doc.nodes.map((n, i) => [n.id, i]));
  const geometries: typeof doc.geometry = [];
  for (const group of groups.values()) {
    const origin = doc.geometry[group[0].geometryRef!].origin ?? [0, 0, 0];
    const length = group.reduce(
      (n, node) => n + doc.geometry[node.geometryRef!].positions.length,
      0,
    );
    if (length * 4 > L.gpuBytes) throw Error("Drawing geometry budget reached");
    const positions = new Float32Array(length),
      owners = new Uint32Array(length / 6);
    let at = 0;
    for (const node of group) {
      const g = doc.geometry[node.geometryRef!];
      for (let i = 0; i < g.positions.length; i++)
        positions[at + i] =
          g.positions[i] + (g.origin?.[i % 3] ?? 0) - origin[i % 3];
      owners.fill(
        nodeIndices.get(node.id)!,
        at / 6,
        (at + g.positions.length) / 6,
      );
      at += g.positions.length;
      delete node.geometryRef;
    }
    const first = group[0],
      layerParent = layers.get(String(first.metadata.layer)) ?? first.parentId;
    const batch = {
      ...first,
      id: "batch-" + geometries.length,
      name: "Layer geometry",
      type: "layer-geometry",
      parentId: layerParent,
      children: [],
      geometryRef: geometries.length,
      metadata: { layer: first.metadata.layer, batch: true },
    };
    doc.nodes.push(batch);
    nodes.set(batch.id, batch);
    if (layerParent) nodes.get(layerParent)?.children.push(batch.id);
    geometries.push({
      positions,
      kind: "lines",
      origin,
      segmentOwners: owners,
    });
  }
  doc.geometry = geometries;
  doc.metadata.omittedEntities=omitted;
  doc.metadata.sourceEntityTypes=sourceEntities;
  const supported=new Set(['LINE','LWPOLYLINE','POLYLINE','CIRCLE','ARC','ELLIPSE','TEXT','MTEXT','INSERT','DIMENSION','POINT','SPLINE','HATCH','3DFACE','SOLID']);
  for(const [type,n] of Object.entries(sourceEntities))if(!supported.has(type))omitted[type]=(omitted[type]??0)+n;
  if(Object.keys(omitted).length)doc.diagnostics.push('Partial drawing: omitted entity counts are listed in Inspector');
  return validateDocument(doc);
}
