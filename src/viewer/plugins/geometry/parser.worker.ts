import { parseFormat } from '../../../formats/content-adapter';
import * as T from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { fromThree, transferableDocument } from "./adapter";
import { GEOMETRY_LIMITS as L } from "./config";
import { parseDrawing } from "./drawing-parser";
import { prepareObj } from './obj-preflight';
import { validatePly } from './ply-preflight';
self.onmessage = async (
  event: MessageEvent<{
    format: string;
    bytes: ArrayBuffer;
    resources: Record<string, string>;
    mtl?: string;
    metadata?: Record<string, unknown>;
  }>,
) => {
  const parseStart=performance.now();
  try {
    const { format, bytes, resources, mtl, metadata } = event.data;
    self.postMessage({ progress: "Parsing geometry…" });
    if(format==='3ds'){
      const doc=await parseFormat('3ds', bytes);
      doc.metadata.parseMs=performance.now()-parseStart;
      self.postMessage({document:doc},{transfer:transferableDocument(doc)});return;
    }
    if (format === "dxf") {
      const doc = parseDrawing(new TextDecoder().decode(bytes));
      doc.metadata.parseMs=performance.now()-parseStart;
      self.postMessage(
        { document: doc },
        { transfer: transferableDocument(doc) },
      );
      return;
    }
    const manager = new T.LoadingManager();
    manager.setURLModifier((url) => {
      if (Object.values(resources).includes(url)) return url;
      if (resources[url]) return resources[url];
      throw Error("Unapproved external resource blocked");
    });
    let root: T.Object3D;
    const text = () => new TextDecoder().decode(bytes);
    if (format === "stl") {
      const view = new DataView(bytes);
      if (
        bytes.byteLength >= 84 &&
        84 + view.getUint32(80, true) * 50 === bytes.byteLength
      ) {
        if (view.getUint32(80, true) > L.triangles)
          throw Error("Triangle budget exceeded");
      } else {
        const source = text();
        if (!/^\s*solid\b/.test(source) || !/facet\s+normal/.test(source))
          throw Error("Truncated or malformed binary STL");
        if (!/endsolid\b/.test(source)) throw Error("Truncated ASCII STL");
        if ((source.match(/\bvertex\s/g) ?? []).length > L.vertices)
          throw Error("STL vertex budget exceeded");
      }
      root = new T.Mesh(
        new STLLoader(manager).parse(bytes),
        new T.MeshStandardMaterial({ color: 0x9aa9b7, side: T.DoubleSide }),
      );
      const geometry=(root as T.Mesh).geometry, positions=geometry.getAttribute('position');
      let degenerate=0;const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
      for(let i=0;i<positions.count;i+=3){a.fromBufferAttribute(positions,i);b.fromBufferAttribute(positions,i+1);c.fromBufferAttribute(positions,i+2);if(![a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z].every(Number.isFinite))throw Error('Non-finite STL coordinate');if(b.sub(a).cross(c.sub(a)).lengthSq()===0)degenerate++;}
      geometry.computeVertexNormals();
      root.userData.elorinStlDegenerate=degenerate;
    } else if (format === "obj") {
      let value = prepareObj(text());
      const first = /^v\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/m.exec(value);
      const origin = first ? first.slice(1).map(Number) : [0, 0, 0];
      if (origin.some((v) => !Number.isFinite(v)))
        throw Error("Non-finite geometry rejected");
      value = value.replace(
        /^v\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)(.*)$/gm,
        (_, x, y, z, tail) =>
          `v ${Number(x) - origin[0]} ${Number(y) - origin[1]} ${Number(z) - origin[2]}${tail}`,
      );
      if (
        (value.match(/^v\s/gm) ?? []).length > L.vertices ||
        (value.match(/^f\s/gm) ?? []).length > L.triangles
      )
        throw Error("OBJ geometry budget exceeded");
      let triangles = 0;
      for (const face of value.matchAll(/^f\s+(.+)$/gm)) {
        triangles += Math.max(0, face[1].trim().split(/\s+/).length - 2);
        if (triangles > L.triangles)
          throw Error("OBJ triangulation budget exceeded");
      }
      const loader = new OBJLoader(manager);
      if (mtl) {
        const materials = new MTLLoader(manager).parse(mtl, "");
        loader.setMaterials(materials);
      }
      root = loader.parse(value);
      root.position.fromArray(origin);
    } else if (format === "ply") {
      validatePly(bytes);
      const value = new TextDecoder().decode(
        new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 32768)),
      );
      for (const match of value.matchAll(/element (vertex|face) (\d+)/g))
        if (Number(match[2]) > (match[1] === "face" ? L.triangles : L.points))
          throw Error("PLY element budget exceeded");
      const g = new PLYLoader(manager).parse(bytes);
      root = g.index
        ? new T.Mesh(
            g,
            new T.MeshStandardMaterial({
              color: g.getAttribute("color") ? 0xffffff : 0x9aa9b7,
              vertexColors: !!g.getAttribute("color"),
              side: T.DoubleSide,
            }),
          )
        : new T.Points(
            g,
            new T.PointsMaterial({
              color: g.getAttribute("color") ? 0xffffff : 0x9aa9b7,
              vertexColors: !!g.getAttribute("color"),
              size: 0.01,
            }),
          );
    } else if (format === "gltf" || format === "glb") {
      const result = await new GLTFLoader(manager).parseAsync(
        format === "glb" && !metadata?.preparedGltf ? bytes : text(),
        "",
      );
      root = result.scene;
    } else
      throw Error("No reliable preview backend is available for this format");
    const doc = fromThree(root, format, "mesh");
    if (format === "gltf" || format === "glb") doc.units = "m";
    doc.metadata = { ...doc.metadata, ...metadata };
    doc.metadata.parseMs=performance.now()-parseStart;
    if(format==='stl'){doc.metadata.degenerateTriangles=root.userData.elorinStlDegenerate;doc.metadata.normals='Recomputed from geometry; source normals are not trusted';if(root.userData.elorinStlDegenerate)doc.diagnostics.push(`${root.userData.elorinStlDegenerate} degenerate triangles retained with zero surface area`);}
    self.postMessage(
      { document: doc },
      { transfer: transferableDocument(doc) },
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
