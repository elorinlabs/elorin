// CC0 generated fixtures; binary structures follow the linked specs in README.md.
const fs=require('fs'),path=require('path');const root=__dirname;
const u16=(n,le=true)=>{const b=Buffer.alloc(2);le?b.writeUInt16LE(n):b.writeUInt16BE(n);return b};
const u32=(n,le=true)=>{const b=Buffer.alloc(4);le?b.writeUInt32LE(n):b.writeUInt32BE(n);return b};
const save=(name,b)=>fs.writeFileSync(path.join(root,name),b);
function psd(rle=false){const w=64,h=64,head=Buffer.alloc(26);head.write('8BPS');head.writeUInt16BE(1,4);head.writeUInt16BE(3,12);head.writeUInt32BE(h,14);head.writeUInt32BE(w,18);head.writeUInt16BE(8,22);head.writeUInt16BE(3,24);
 const planes=Buffer.alloc(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const color=y<32?(x<32?[255,0,0]:[0,255,0]):(x<32?[0,0,255]:[255,255,255]);for(let c=0;c<3;c++)planes[c*w*h+y*w+x]=color[c];}
 const rows=[];for(let c=0;c<3;c++)for(let y=0;y<h;y++)rows.push(Buffer.concat([Buffer.from([w-1]),planes.subarray(c*w*h+y*w,c*w*h+(y+1)*w)]));
 return Buffer.concat([head,Buffer.alloc(12),u16(rle?1:0,false),...(rle?[...rows.map(row=>u16(row.length,false)),...rows]:[planes])]);}
save('quadrants.psd',psd());save('quadrants-rle.psd',psd(true));save('damaged.psd',psd(true).subarray(0,-1));
const giant=psd().subarray(0,26);giant.writeUInt32BE(30000,14);giant.writeUInt32BE(30000,18);save('oversized.psd',giant);
function mat(name,rows,cols,values,le=true,imaginary){const b=Buffer.alloc(20);const write=(n,at)=>le?b.writeInt32LE(n,at):b.writeInt32BE(n,at);const label=Buffer.from(name+'\0');write(le?0:1000,0);write(rows,4);write(cols,8);write(imaginary?1:0,12);write(label.length,16);const payload=Buffer.alloc(values.length*8*(imaginary?2:1));for(const [i,n]of [...values,...(imaginary??[])].entries())le?payload.writeDoubleLE(n,i*8):payload.writeDoubleBE(n,i*8);return Buffer.concat([b,label,payload]);}
save('signals.mat',Buffer.concat([mat('signal',3,2,[1.25,2.5,3.75,10,20,30]),mat('complex_signal',2,1,[4,5],true,[6,-7])]));
save('big-endian.mat',mat('big_endian',2,2,[-2,3,40,50],false));save('damaged.mat',mat('bad',2,2,[1,2,3,4]).subarray(0,-1));
const chunk=(id,...parts)=>{const body=Buffer.concat(parts);return Buffer.concat([u16(id),u32(body.length+6),body])};
const points=[[0,0,0],[2,0,0],[0,2,0],[0,0,2]],triangles=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],vertices=Buffer.alloc(points.length*12);points.flat().forEach((n,i)=>vertices.writeFloatLE(n,i*4));
const faces=Buffer.concat(triangles.map(t=>Buffer.concat([...t.map(n=>u16(n)),u16(0)])));
const mesh=chunk(0x4100,chunk(0x4110,u16(points.length),vertices),chunk(0x4120,u16(triangles.length),faces));
const model=chunk(0x4d4d,chunk(0x0002,u32(3)),chunk(0x3d3d,chunk(0x4000,Buffer.from('tetrahedron\0'),mesh)));
save('tetrahedron.3ds',model);save('damaged.3ds',model.subarray(0,-2));save('external-texture.3ds',chunk(0x4d4d,chunk(0x3d3d,chunk(0xafff,chunk(0xa000,Buffer.from('external'+String.fromCharCode(0))),chunk(0xa200,chunk(0xa300,Buffer.from('../secret.png'+String.fromCharCode(0))))),chunk(0x4000,Buffer.from('mesh\0'),mesh))));
const {zipSync}=require('fflate');save('adapted-files.zip',zipSync({'quadrants.psd':psd(),'signals.mat':fs.readFileSync(path.join(root,'signals.mat')),'tetrahedron.3ds':model}));
// TIFF 6.0 big-endian RGB uncompressed strip: an actual image, not just a signature.
const tags=[[256,4,1,8],[257,4,1,8],[258,3,3,134],[259,3,1,1],[262,3,1,2],[273,4,1,140],[277,3,1,3],[278,4,1,8],[279,4,1,192],[284,3,1,1]];
const tiff=Buffer.alloc(332);tiff.write('MM');tiff.writeUInt16BE(42,2);tiff.writeUInt32BE(8,4);tiff.writeUInt16BE(10,8);for(let i=0;i<tags.length;i++){const [tag,type,count,value]=tags[i],at=10+i*12;tiff.writeUInt16BE(tag,at);tiff.writeUInt16BE(type,at+2);tiff.writeUInt32BE(count,at+4);type===3&&count===1?tiff.writeUInt16BE(value,at+8):tiff.writeUInt32BE(value,at+8);}for(let i=134;i<140;i+=2)tiff.writeUInt16BE(8,i);for(let i=140;i<332;i+=3){tiff[i]=0;tiff[i+1]=255;tiff[i+2]=255;}save('big-endian.tiff',tiff);
console.log('Generated genuine PSD, MAT Level 4, 3DS binary fixtures and VFS container');
