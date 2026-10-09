import { GEOMETRY_LIMITS as L } from './config';
/** Walk property declarations and list lengths before PLYLoader expands any arrays. */
export function validatePly(bytes: ArrayBuffer) {
  const head=new TextDecoder().decode(new Uint8Array(bytes,0,Math.min(bytes.byteLength,65536)));
  const end=/end_header\r?\n/.exec(head);if(!end||!head.startsWith('ply'))throw Error('Malformed PLY header');
  const offset=new TextEncoder().encode(head.slice(0,end.index+end[0].length)).length;
  const format=/^format (\S+) 1\.0$/m.exec(head.replace(/\r/g,''))?.[1];
  if(!['ascii','binary_little_endian','binary_big_endian'].includes(format??''))throw Error('Unsupported PLY format');
  const types:Record<string,[number,string]>={char:[1,'getInt8'],int8:[1,'getInt8'],uchar:[1,'getUint8'],uint8:[1,'getUint8'],short:[2,'getInt16'],int16:[2,'getInt16'],ushort:[2,'getUint16'],uint16:[2,'getUint16'],int:[4,'getInt32'],int32:[4,'getInt32'],uint:[4,'getUint32'],uint32:[4,'getUint32'],float:[4,'getFloat32'],float32:[4,'getFloat32'],double:[8,'getFloat64'],float64:[8,'getFloat64']};
  const elements:{name:string;count:number;properties:{type:string;count?:string}[]}[]=[];
  for(const line of head.slice(0,end.index).split(/\r?\n/)){
    const p=line.trim().split(/\s+/);
    if(p[0]==='element'){const count=Number(p[2]);if(!Number.isSafeInteger(count)||count<0||count>L.vertices)throw Error('PLY element budget exceeded');elements.push({name:p[1],count,properties:[]});}
    if(p[0]==='property'){const current=elements.at(-1);if(!current)throw Error('PLY property before element');const spec=p[1]==='list'?{count:p[2],type:p[3]}:{type:p[1]};if(!types[spec.type]||(spec.count&&!types[spec.count]))throw Error('Unsupported PLY property type');current.properties.push(spec);if(current.properties.length>128)throw Error('PLY property budget exceeded');}
  }
  const text=format==='ascii'?new TextDecoder().decode(new Uint8Array(bytes,offset)):'';
  let cursor=0,at=offset,output=0,triangles=0;
  const view=new DataView(bytes);
  const number=(type:string)=>{
    if(format==='ascii'){while(cursor<text.length&&/\s/.test(text[cursor]))cursor++;const begin=cursor;while(cursor<text.length&&!/\s/.test(text[cursor]))cursor++;if(begin===cursor)throw Error('Truncated ASCII PLY');const n=Number(text.slice(begin,cursor));if(!Number.isFinite(n))throw Error('Non-finite PLY property');return n;}
    const [width,method]=types[type];if(at+width>bytes.byteLength)throw Error('Truncated binary PLY');const n=(view as any)[method](at,format==='binary_little_endian');at+=width;if(!Number.isFinite(n))throw Error('Non-finite PLY property');return n as number;
  };
  let total=0;
  for(const e of elements){total+=e.count;if(total>L.vertices+L.triangles)throw Error('PLY total element budget exceeded');for(let row=0;row<e.count;row++)for(const prop of e.properties){
    const count=prop.count?number(prop.count):1;if(!Number.isSafeInteger(count)||count<0||count>4096)throw Error('PLY list length budget exceeded');
    output+=count*8;if(output>L.cpuBytes)throw Error('PLY decoded property budget exceeded');
    if(e.name==='face'&&prop.count){triangles+=Math.max(0,count-2);if(triangles>L.triangles)throw Error('PLY face budget exceeded');}
    for(let n=0;n<count;n++){const v=number(prop.type);if(e.name==='face'&&prop.count&&(!Number.isSafeInteger(v)||v<0||v>=(elements.find(x=>x.name==='vertex')?.count??0)))throw Error('PLY face index outside vertices');}
  }}
}
