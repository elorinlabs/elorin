import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {indexText,readTextLines,searchText} from '../src/viewer/plugins/text/text-engine';
import {TEXT_CONFIG} from '../src/viewer/plugins/text/text-config';
it('measures bounded indexing of 1/20/100 MiB and 1 GiB virtual sources with exact line offsets',async()=>{
 const records=[];
 for(const size of [1024**2,20*1024**2,100*1024**2,1024**3]){
  let peakRead=0,calls=0,checkpoints=0,last:any;
  const read=async(at:number,n:number)=>{calls++;peakRead=Math.max(peakRead,n);const b=new Uint8Array(Math.min(n,size-at));b.fill(120);for(let i=4095-(at%4096);i<b.length;i+=4096)b[i]=10;return b;};
  const start=performance.now();await indexText(read,size,'utf-8',s=>{last=s;checkpoints+=s.checkpoints.length;});
  expect(last.lines).toBe(size/4096+1);expect(last.complete).toBe(true);expect(last.longestLine).toBe(4095);expect(peakRead).toBeLessThanOrEqual(TEXT_CONFIG.chunkBytes);expect(checkpoints).toBeLessThanOrEqual(TEXT_CONFIG.maxCheckpoints);
  const tail=await readTextLines(read,size,'utf-8',size-4096,size/4096,size/4096,2);expect(tail[0].offset).toBe(size-4096);expect(tail[0].text).toBe('x'.repeat(4095));expect(tail[1].text).toBe('');
  records.push({logicalBytes:size,indexMs:performance.now()-start,lines:last.lines,calls,peakRangeBytes:peakRead,checkpointCount:checkpoints,checkpointPayloadBytes:checkpoints*8});
 }
 let count=0,lines=0;const millionSize=2_000_000;const read=async(at:number,n:number)=>{const b=new Uint8Array(Math.min(n,millionSize-at));for(let i=0;i<b.length;i++)b[i]=(at+i)%2?10:120;return b;};await indexText(read,millionSize,'utf-8',s=>{count+=s.checkpoints.length;lines=s.lines;});expect(lines).toBe(1_000_001);expect(count).toBeLessThan(4000);
 let cap=0,last:any;const enormous=64*1024**2;await indexText(async(at,n)=>{const b=new Uint8Array(n);for(let i=0;i<n;i++)b[i]=(at+i)%2?10:120;return b;},enormous,'utf-8',s=>{cap+=s.checkpoints.length;last=s;});expect(cap).toBe(TEXT_CONFIG.maxCheckpoints);expect(last.limited).toBe(true);expect(last.complete).toBe(false);expect(last.processed).toBeLessThan(enormous);
 let cancelledReads=0;await expect(indexText(async()=>{if(++cancelledReads>2)throw new DOMException('Cancelled','AbortError');return new Uint8Array(TEXT_CONFIG.chunkBytes);},1024**3,'utf-8',()=>{})).rejects.toHaveProperty('name','AbortError');expect(cancelledReads).toBe(3);
 writeFileSync('docs/qa/module-19-index-performance.json',JSON.stringify({environment:'Current Windows host; Vitest/Node simulated range provider; no full-size disk allocation; not low-end hardware',records,millionLines:{lines,checkpointCount:count},indexBudget:{checkpoints:cap,processedBytes:last.processed,totalBytes:enormous,complete:false}},null,2));
},120000);
it('whole-word search respects supplementary Unicode letters and UTF-16 result columns',async()=>{
 const bytes=new TextEncoder().encode('𠀀foo foo🌈\r\n中\tfoo');let matches:any[]=[];await searchText(async(at,n)=>bytes.slice(at,at+n),bytes.length,'utf-8',{query:'foo',caseSensitive:true,wholeWord:true,regex:false},s=>matches.push(...s.matches));expect(matches).toEqual([{line:1,column:6,length:3},{line:2,column:2,length:3}]);
 const boundary=new TextEncoder().encode('x'.repeat(TEXT_CONFIG.chunkBytes-5)+'𠀀foo foo');matches=[];await searchText(async(at,n)=>boundary.slice(at,at+n),boundary.length,'utf-8',{query:'foo',caseSensitive:true,wholeWord:true,regex:false},s=>matches.push(...s.matches));expect(matches).toEqual([{line:1,column:TEXT_CONFIG.chunkBytes+1,length:3}]);
});

