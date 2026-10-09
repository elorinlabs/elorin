import {it,expect} from 'vitest';
import {writeFileSync,mkdirSync} from 'node:fs';
import {BinaryModel} from '../src/viewer/plugins/hex/binary-model';
import type {FileSource} from '../src/services/fileSource';
it('records bounded cache allocations for small/100MB/1GB/5GB logical sources',async()=>{
 const records=[];
 for(const size of [128,100*1024**2,1024**3,5*1024**3]){
  let bytesRead=0,calls=0,peakCache=0;
  const source:FileSource={getSize:async()=>size,readRange:async(at,n)=>{calls++;bytesRead+=n;const bytes=new Uint8Array(Math.min(n,size-at));for(let i=0;i<bytes.length;i++)bytes[i]=(at+i)%256;return bytes;},readAll:async()=>{throw Error('Whole read forbidden');},readText:async()=>{throw Error('Text read forbidden');}};
  const model=await BinaryModel.open(source,new AbortController().signal,262144);const start=performance.now();
  for(let i=0;i<200;i++){const at=BigInt(Math.floor((size-1)*i/199));expect((await model.read(at,1))[0]).toBe(Number(at%256n));peakCache=Math.max(peakCache,model.cacheBytes);expect(model.cacheBytes).toBeLessThanOrEqual(262144);}
  records.push({logicalSize:size,jumps:200,totalMs:performance.now()-start,calls,bytesRead,peakCacheBytes:peakCache});model.dispose();expect(model.cacheBytes).toBe(0);
 }
 mkdirSync('docs/qa',{recursive:true});writeFileSync('docs/qa/module-18-model-performance.json',JSON.stringify({environment:'Current Windows host, Node; simulated range providers, not old i5 hardware',cacheBudget:262144,records},null,2));
});
