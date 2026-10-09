import type { FileSource } from '../../../services/fileSource';
import { BinaryModel } from '../hex/binary-model';
export async function sampleWaveform(source:FileSource,signal:AbortSignal) {
  const binary=await BinaryModel.open(source,signal,65536);
  try{
    const head=await binary.read(0n,12),text=new TextDecoder();
    if(text.decode(head.subarray(0,4))!=='RIFF'||text.decode(head.subarray(8))!=='WAVE')throw Error('Unsupported Codec: sampled waveform currently supports RIFF PCM/float WAV');
    let at=12n,format=0,channels=0,bits=0,align=0,rate=0,dataAt=0n,dataBytes=0;
    for(let chunks=0;chunks<1024&&at+8n<=binary.size;chunks++){
      const bytes=await binary.read(at,8),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(4,true),id=text.decode(bytes.subarray(0,4));
      if(at+8n+BigInt(length)>binary.size)throw Error('Corrupted File: WAV chunk outside source');
      if(id==='fmt '){if(length<16)throw Error('Corrupted File: WAV format');const b=await binary.read(at+8n,16),v=new DataView(b.buffer,b.byteOffset,b.byteLength);format=v.getUint16(0,true);channels=v.getUint16(2,true);rate=v.getUint32(4,true);align=v.getUint16(12,true);bits=v.getUint16(14,true);}
      if(id==='data'){dataAt=at+8n;dataBytes=length;break;}at+=8n+BigInt(length+(length&1));
    }
    if(![1,3].includes(format)||!channels||channels>32||!rate||![8,16,24,32].includes(bits)||format===3&&bits!==32||align!==channels*bits/8)throw Error('Unsupported Codec: WAV waveform datatype');
    const frames=Math.floor(dataBytes/align),bins=Math.min(256,frames);if(!bins)return {peaks:[],duration:0,sampledFrames:0};
    const window=Math.min(64,Math.floor(1048576/(bins*align))),peaks:number[]=[];let sampled=0;
    for(let i=0;i<bins;i++){const frame=Math.floor(i*Math.max(0,frames-window)/Math.max(1,bins-1)),n=Math.min(window,frames-frame),bytes=await binary.read(dataAt+BigInt(frame*align),n*align),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let peak=0;
      for(let p=0;p<bytes.length;p+=bits/8){let value:number;if(format===3)value=v.getFloat32(p,true);else if(bits===8)value=(v.getUint8(p)-128)/128;else if(bits===16)value=v.getInt16(p,true)/32768;else if(bits===32)value=v.getInt32(p,true)/2147483648;else{let value24=v.getUint8(p)|v.getUint8(p+1)<<8|v.getUint8(p+2)<<16;if(value24&0x800000)value24-=0x1000000;value=value24/8388608;}if(Number.isFinite(value))peak=Math.max(peak,Math.min(1,Math.abs(value)));}peaks.push(peak);sampled+=n;
    }
    return {peaks,duration:frames/rate,sampledFrames:sampled};
  }finally{binary.dispose();}
}
