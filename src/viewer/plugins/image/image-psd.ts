import type { ContentAdapter } from '../../../formats/content-adapter';
const PIXELS = 16_777_216, FILE_BYTES = 64 * 1024 ** 2;
export function psdHeader(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if(bytes.length < 26 || new TextDecoder().decode(bytes.subarray(0,4)) !== '8BPS') throw Error('Corrupted File: PSD signature/header');
  if(v.getUint16(4)!==1) throw Error('UnsupportedFormat: PSD version (PSB is not supported)');
  if(bytes.subarray(6,12).some(b=>b!==0)) throw Error('Corrupted File: PSD reserved header');
  const channels=v.getUint16(12),h=v.getUint32(14),w=v.getUint32(18),depth=v.getUint16(22),mode=v.getUint16(24);
  if(!w||!h||w>30000||h>30000||w*h>PIXELS) throw Error('Resource Limit Exceeded: PSD 16 MP composite budget');
  if(depth!==8||!((mode===3&&channels===3)||(mode===1&&channels===1))) throw Error('UnsupportedFormat: PSD supports 8-bit RGB/grayscale composite without extra channels');
  return {w,h,channels,depth,mode};
}
export function decodePsd(buffer: ArrayBuffer) {
  if(buffer.byteLength>FILE_BYTES) throw Error('Resource Limit Exceeded: PSD compressed file budget');
  const bytes=new Uint8Array(buffer),v=new DataView(buffer),header=psdHeader(bytes);
  const {w,h,channels}=header;let at=26;
  const need=(n:number,end=bytes.length)=>{if(!Number.isSafeInteger(n)||n<0||at+n>end)throw Error('Corrupted File: truncated PSD section');};
  const section=()=>{need(4);const n=v.getUint32(at);at+=4;need(n);const start=at;at+=n;return [start,at];};
  section();const [resources,end]=section();const after=at;at=resources;
  // Image resources are length-prefixed and padded; never execute metadata or links.
  while(at<end){need(7,end);if(v.getUint32(at)!==0x3842494d)throw Error('Corrupted File: PSD resource signature');const id=v.getUint16(at+4);at+=6;const name=bytes[at];need(1+name,end);at+=1+name;if((1+name)%2)at++;need(4,end);const n=v.getUint32(at);at+=4;need(n+(n%2),end);if(id===1039)throw Error('UnsupportedFormat: PSD embedded ICC profile cannot be safely applied by composite decoder');at+=n+(n%2);}
  at=after;section();need(2);const compression=v.getUint16(at);at+=2;
  if(compression>1)throw Error('UnsupportedFormat: PSD ZIP compression');
  const lengths:number[]=[];
  if(compression===1){need(h*channels*2);for(let i=0;i<h*channels;i++)lengths.push(v.getUint16(at+i*2));at+=h*channels*2;}
  else if(bytes.length-at!==w*h*channels)throw Error('Corrupted File: PSD raw composite length');
  const rgba=new Uint8ClampedArray(w*h*4);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
  const row=new Uint8Array(w);
  for(let channel=0;channel<channels;channel++)for(let y=0;y<h;y++){
    if(compression===0){need(w);row.set(bytes.subarray(at,at+w));at+=w;}
    else {const n=lengths[channel*h+y];need(n);const stop=at+n;let x=0;
      while(at<stop){const code=v.getInt8(at++);if(code===-128)continue;const count=code>=0?code+1:1-code;if(x+count>w)throw Error('Corrupted File: PSD RLE row overflow');if(code>=0){need(count,stop);row.set(bytes.subarray(at,at+count),x);at+=count;}else{need(1,stop);row.fill(bytes[at++],x,x+count);}x+=count;}
      if(x!==w)throw Error('Corrupted File: PSD RLE row underflow');
    }
    for(let x=0;x<w;x++){const i=(y*w+x)*4;if(channels===1)rgba[i]=rgba[i+1]=rgba[i+2]=row[x];else rgba[i+channel]=row[x];}
  }
  if(at!==bytes.length)throw Error('Corrupted File: trailing PSD composite payload');
  return {rgba,w,h,depth:8,alpha:false};
}
export const psdAdapter:ContentAdapter<ArrayBuffer,ReturnType<typeof decodePsd>>={id:'psd-composite',formats:['psd'],parse:decodePsd};
