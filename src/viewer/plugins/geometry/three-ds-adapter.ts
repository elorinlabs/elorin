import type { ContentAdapter } from '../../../formats/content-adapter';
import type { GeometryDocumentModel } from './types';
import { GEOMETRY_LIMITS as L } from './config';
/** Validate lengths and allocation counts before the existing Three decoder allocates.
 * Unknown chunks are skipped; texture references are refused, never fetched.
 */
export function validateThreeDs(buffer:ArrayBuffer){
  const v=new DataView(buffer);let chunks=0,vertices=0,faces=0,objects=0,materials=0;
  const need=(at:number,n:number,end:number)=>{if(at+n>end)throw Error('Corrupted File: 3DS chunk payload');};
  if(buffer.byteLength<6||v.getUint16(0,true)!==0x4d4d||v.getUint32(2,true)!==buffer.byteLength)throw Error('Corrupted File: 3DS main signature/length');
  if(buffer.byteLength>32*1024**2)throw Error('Resource Limit Exceeded: 3DS 32 MiB budget');
  function walk(at:number,end:number,depth:number,mesh?:{vertices?:number;indices:number[]}){
    if(depth>32)throw Error('Resource Limit Exceeded: 3DS nesting');
    while(at<end){need(at,6,end);const id=v.getUint16(at,true),n=v.getUint32(at+2,true),stop=at+n;let p=at+6;
      if(n<6||stop>end)throw Error('Corrupted File: 3DS chunk length');
      if(++chunks>100000)throw Error('Resource Limit Exceeded: 3DS chunks');
      if([0xa200,0xa230,0xa210,0xa204].includes(id))throw Error('UnsupportedFormat: 3DS external textures; no file/network access was granted');
      if([0x4d4d,0x3d3d,0xafff].includes(id)){
        if(id===0xafff&&++materials>L.materials)throw Error('Resource Limit Exceeded: 3DS materials');walk(p,stop,depth+1,mesh);
      }else if(id===0x4000){
        if(++objects>4096)throw Error('Resource Limit Exceeded: 3DS objects');
        const start=p;while(p<stop&&v.getUint8(p)!==0&&p-start<256)p++;
        if(p===stop||p-start===256)throw Error('Corrupted File: 3DS object name');walk(p+1,stop,depth+1);
      }else if(id===0x4100){const data={vertices:undefined as number|undefined,indices:[] as number[]};walk(p,stop,depth+1,data);if(data.vertices===undefined||data.indices.some(i=>i>=data.vertices!))throw Error('Corrupted File: 3DS vertex/index reference');
      }else if(id===0x4110||id===0x4140){
        need(p,2,stop);const count=v.getUint16(p,true),width=id===0x4110?12:8;p+=2;need(p,count*width,stop);
        if(p+count*width!==stop)throw Error('Corrupted File: 3DS vertex/UV count');
        if(id===0x4110){if(!mesh||mesh.vertices!==undefined)throw Error('Corrupted File: duplicate/misplaced 3DS vertex array');mesh.vertices=count;vertices+=count;if(vertices>L.vertices)throw Error('Resource Limit Exceeded: 3DS vertices');}
        for(let i=p;i<stop;i+=4)if(!Number.isFinite(v.getFloat32(i,true)))throw Error('Corrupted File: non-finite 3DS coordinate');
      }else if(id===0x4120){
        need(p,2,stop);const count=v.getUint16(p,true);p+=2;need(p,count*8,stop);faces+=count;if(faces>L.triangles||!mesh)throw Error('Resource Limit Exceeded: 3DS faces');
        for(let i=0;i<count;i++)for(let j=0;j<3;j++)mesh.indices.push(v.getUint16(p+i*8+j*2,true));
        // Material/smoothing face subchunks are bounded too.
        walk(p+count*8,stop,depth+1,mesh);
      }else if(id===0x0002||id===0x3d3e){need(p,4,stop);if(v.getUint32(p,true)>3)throw Error('UnsupportedFormat: 3DS version');
      }else if(id===0x4160){need(p,48,stop);for(let i=p;i<p+48;i+=4)if(!Number.isFinite(v.getFloat32(i,true)))throw Error('Corrupted File: 3DS transform');
      }else if(id===0x4130){const start=p;while(p<stop&&v.getUint8(p)!==0&&p-start<256)p++;if(p===stop||p-start===256)throw Error('Corrupted File: 3DS material group');p++;need(p,2,stop);const count=v.getUint16(p,true);need(p+2,count*2,stop);}
      at=stop;
    }
  }
  walk(0,buffer.byteLength,0);if(!faces||!vertices)throw Error('UnsupportedFormat: 3DS has no static triangle mesh');
}
export const threeDsAdapter:ContentAdapter<ArrayBuffer,GeometryDocumentModel>={id:'three-ds-static',formats:['3ds'],async parse(buffer){
  validateThreeDs(buffer);
  const [{TDSLoader},{LoadingManager},{fromThree}]=await Promise.all([import('three/addons/loaders/TDSLoader.js'),import('three'),import('./adapter')]);
  const manager=new LoadingManager();manager.setURLModifier(()=>{throw Error('Unapproved external resource blocked');});
  const root=new TDSLoader(manager).parse(buffer,'');
  try {const doc=fromThree(root,'3ds','scene');doc.diagnostics.push('Static triangle meshes only; keyframe animation and external textures are not loaded.');return doc;}
  finally {root.traverse(object=>{const mesh=object as import('three').Mesh;mesh.geometry?.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[])material.dispose();});}
}};
