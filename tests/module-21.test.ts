import { it, expect } from 'vitest';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { prepareObj } from '../src/viewer/plugins/geometry/obj-preflight';
import { acquireGeometryDecode } from '../src/viewer/plugins/geometry/decode-budget';
import { validatePly } from '../src/viewer/plugins/geometry/ply-preflight';
import { validateGltf } from '../src/viewer/plugins/geometry/geometry-model';
import { readFileSync } from 'node:fs';
import { parseDrawing } from '../src/viewer/plugins/geometry/drawing-parser';
import { GeometryModel } from '../src/viewer/plugins/geometry/geometry-model';
import type { ViewerContext } from '../src/viewer/core/types';
it('inactive engineering session drops CPU scene arrays and resolved task references',()=>{
 let cleanup=()=>{};const model=new GeometryModel({file:{detectedType:'stl'},onCleanup:(f:()=>void)=>{cleanup=f;}} as unknown as ViewerContext);
 model.document.geometry=[{kind:'mesh',positions:new Float32Array(9000)}];model.ready=Promise.resolve();model.setActive(false);
 expect(model.document.geometry.length).toBe(0);expect(model.ready).toBeUndefined();expect(model.progress).toBe('Paused');cleanup();
});
it('DXF arbitrary-axis circle maps OCS normal into world bounds',()=>{
 const dxf='0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\n0\n10\n0\n20\n0\n30\n0\n40\n2\n210\n0\n220\n1\n230\n0\n0\nENDSEC\n0\nEOF\n';
 const d=parseDrawing(dxf);expect(d.bounds.max[0]-d.bounds.min[0]).toBeCloseTo(4);expect(d.bounds.max[2]-d.bounds.min[2]).toBeCloseTo(4);expect(d.bounds.max[1]-d.bounds.min[1]).toBeCloseTo(0);
});
it.each(['basic.ply','binary-le.ply','binary-be.ply','point-cloud.ply'])('validates PLY property encoding %s',name=>{const b=readFileSync('test-fixtures/3d/mesh/'+name);expect(()=>validatePly(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))).not.toThrow();});
it('rejects oversized PLY list before expansion',()=>{const bytes=new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uint int vertex_indices\nend_header\n0 0 0\n4294967295\n');expect(()=>validatePly(bytes.buffer)).toThrow('list length');});
it('glTF validates view, stride, sparse ranges and decoder extensions',()=>{
 const json=()=>JSON.parse(readFileSync('test-fixtures/3d/mesh/basic.gltf','utf8'));
 const a=json();a.bufferViews[0].byteLength=100000;expect(()=>validateGltf(a)).toThrow('BufferView');
 const b=json();b.bufferViews[0].byteStride=1;expect(()=>validateGltf(b)).toThrow('stride');
 const c=json();c.accessors[0].sparse={count:999,indices:{bufferView:0,componentType:5123},values:{bufferView:0}};expect(()=>validateGltf(c)).toThrow('sparse');
 const d=json();d.extensionsUsed=['KHR_texture_basisu'];expect(()=>validateGltf(d)).toThrow('Decoder unavailable');
});
const polygon='v 0 0 0\nv 2 0 0\nv 2 2 0\nv 1 1 0\nv 0 2 0\n';
it('triangulates concave OBJ polygon preserving its area',()=>{
 const source=prepareObj(polygon+'f 1 2 3 4 5'),root=new OBJLoader().parse(source),p=(root.children[0] as any).geometry.attributes.position.array;
 expect(p.length).toBe(27);let area=0;for(let i=0;i<p.length;i+=9)area+=Math.abs((p[i+3]-p[i])*(p[i+7]-p[i+1])-(p[i+4]-p[i+1])*(p[i+6]-p[i]))/2;expect(area).toBe(3);
});
it('normalizes negative OBJ vertex, normal and UV references',()=>{
 const source=prepareObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nf -3/-3/-1 -2/-2/-1 -1/-1/-1');
 expect(source).toContain('1/1/1');expect(source).toContain('3/3/1');
});
it.each(['f 0 2 3','f 1 2 99','f -99 2 3','f 1/99 2 3','f 1 1 2'])('rejects invalid OBJ face %s',face=>expect(()=>prepareObj(polygon+face)).toThrow());
it('rejects self-intersecting and non-planar faces',()=>{
 expect(()=>prepareObj('v 0 0 0\nv 2 0 0\nv 0 2 0\nv 2 2 0\nf 1 2 3 4')).toThrow();
 expect(()=>prepareObj('v 0 0 0\nv 2 0 0\nv 2 2 1\nv 0 2 0\nf 1 2 3 4')).toThrow();
});
it('serializes heavy decoders and removes a cancelled waiter',async()=>{
 const a=new AbortController(),b=new AbortController(),c=new AbortController();const release=await acquireGeometryDecode(a.signal);
 let entered=false;const next=acquireGeometryDecode(b.signal).then(r=>{entered=true;return r;});const cancelled=acquireGeometryDecode(c.signal);c.abort();await expect(cancelled).rejects.toThrow('Cancelled');await Promise.resolve();expect(entered).toBe(false);release();(await next)();const end=await acquireGeometryDecode(a.signal);end();end();
});
