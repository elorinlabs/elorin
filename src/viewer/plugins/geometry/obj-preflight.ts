import { ShapeUtils, Vector2 } from 'three';
import { GEOMETRY_LIMITS as L } from './config';
/** Validate indices before OBJLoader allocation, then earcut simple planar polygons. */
export function prepareObj(source: string) {
  const vertices: number[][] = []; let normals = 0, uvs = 0, triangles = 0;
  const index = (value: string, count: number) => {
    if (!/^-?[1-9]\d*$/.test(value)) throw Error('Invalid OBJ index');
    const raw = Number(value), id = raw > 0 ? raw - 1 : count + raw;
    if (!Number.isSafeInteger(raw) || id < 0 || id >= count) throw Error('OBJ index outside declared data');
    return id;
  };
  const result: string[] = [];
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim().split('#')[0].trim(), parts = line.split(/\s+/), kind = parts.shift();
    if (kind === 'v' || kind === 'vn' || kind === 'vt') {
      const n = kind === 'vt' ? 2 : 3;
      if (parts.length < n || parts.slice(0,n).some(v => !Number.isFinite(Number(v)))) throw Error('Non-finite or malformed OBJ coordinate');
      if (kind === 'v') { vertices.push(parts.slice(0,3).map(Number)); if(vertices.length>L.vertices)throw Error('OBJ vertex budget exceeded'); }
      if (kind === 'vn') normals++; if(kind === 'vt') uvs++;
    }
    if (kind !== 'f') { result.push(original); continue; }
    if(parts.length<3||parts.length>4096)throw Error('Invalid or oversized OBJ polygon');
    const tokens = parts.map(token => {
      const fields=token.split('/'); if(fields.length>3)throw Error('Invalid OBJ face token');
      const v=index(fields[0],vertices.length);
      return { v, token: [String(v+1), fields[1] ? String(index(fields[1],uvs)+1) : '', fields[2] ? String(index(fields[2],normals)+1) : ''].slice(0,fields.length).join('/') };
    });
    if(new Set(tokens.map(t=>t.v)).size!==tokens.length)throw Error('Degenerate OBJ polygon: duplicate vertices');
    const points=tokens.map(t=>vertices[t.v]), normal=[0,0,0];
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length]; normal[0]+=(a[1]-b[1])*(a[2]+b[2]);normal[1]+=(a[2]-b[2])*(a[0]+b[0]);normal[2]+=(a[0]-b[0])*(a[1]+b[1]);}
    const length=Math.hypot(...normal);if(!Number.isFinite(length)||length===0)throw Error('Degenerate OBJ polygon');
    const extent=Math.max(...points.flatMap(p=>p.map((v,i)=>Math.abs(v-points[0][i]))),1e-12);
    if(points.some(p=>Math.abs(p.reduce((s,v,i)=>s+(v-points[0][i])*normal[i]/length,0))>extent*1e-6))throw Error('Non-planar OBJ polygon cannot be reliably triangulated');
    const axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))), contour=points.map(p=>new Vector2(...(p.filter((_,i)=>i!==axis) as [number,number])));
    const cross=(a:Vector2,b:Vector2,c:Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(let i=0;i<contour.length;i++)for(let j=i+1;j<contour.length;j++){
      if(j===i+1||(i===0&&j===contour.length-1))continue;
      const a=contour[i],b=contour[(i+1)%contour.length],c=contour[j],d=contour[(j+1)%contour.length];
      if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)))throw Error('Self-intersecting OBJ polygon');
    }
    const faces=ShapeUtils.triangulateShape(contour,[]);
    if(faces.length!==tokens.length-2)throw Error('OBJ triangulation incomplete');
    for(const face of faces){ if(cross(...(face.map(i=>contour[i]) as [Vector2,Vector2,Vector2]))===0)throw Error('Degenerate OBJ triangle'); result.push('f '+face.map(i=>tokens[i].token).join(' ')); }
    triangles+=faces.length;if(triangles>L.triangles)throw Error('OBJ triangle budget exceeded');
  }
  return result.join('\n');
}
