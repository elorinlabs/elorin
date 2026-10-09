import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useRef, useState } from 'react';
import type { ViewerPlugin, ViewerRenderProps } from '../../core/types';
import { parseSubtitles,type SubtitleDocument } from './subtitles';
import { checkAbort } from '../../core/errors';
import { visibleRange } from '../../shared/virtual-grid';
interface Model { source:string;document:SubtitleDocument;error?:string }
function SubtitleViewer({model}:ViewerRenderProps<Model>){
  useLocale();
  const list=useRef<HTMLDivElement>(null);
  const [query,setQuery]=useState(''),[top,setTop]=useState(0),[raw,setRaw]=useState(false),[jump,setJump]=useState('0');
  const cues=model.document.cues.filter(c=>c.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));const range=visibleRange(top,480,96,cues.length,3);
  return <section className="subtitle-viewer" style={{display:'flex',flexDirection:'column',minHeight:0,height:'100%'}}>
    <div><input aria-label={tr("Search subtitles")} value={query} onChange={e=>{setQuery(e.target.value);setTop(0);if(list.current)list.current.scrollTop=0;}}/><button onClick={()=>setRaw(v=>!v)}>{raw?tr("Subtitle list"):tr("Source text")}</button><input aria-label={tr("Jump to seconds")} value={jump} onChange={e=>setJump(e.target.value)}/><button onClick={()=>{const n=Number(jump);if(Number.isFinite(n)&&n>=0){const index=cues.findIndex(c=>c.end>=n*1000);if(list.current&&index>=0)list.current.scrollTop=index*96;}}}>{tr("Go")}</button></div>
    {model.error&&<p role="alert">{model.error}</p>}
    {model.document.warnings.map((w,i)=><p key={i}>{w}</p>)}
    {raw?<pre style={{overflow:'auto',whiteSpace:'pre-wrap'}}>{model.source}</pre>:<div ref={list} className="subtitle-cues" role="list" onScroll={e=>setTop(e.currentTarget.scrollTop)} style={{overflow:'auto',height:480,maxHeight:'65vh'}}><div style={{height:cues.length*96,position:'relative'}}>{cues.slice(range.start,range.end).map((c,i)=><article role="listitem" key={c.id} style={{position:'absolute',top:(range.start+i)*96,height:96,left:0,right:0,overflow:'auto'}}><small>{(c.start/1000).toFixed(3)} → {(c.end/1000).toFixed(3)} {' '}{tr("seconds")}{' '}{c.style&&tr("· {v0}", { v0: c.style })}</small><pre style={{margin:0,whiteSpace:'pre-wrap'}}>{c.text}</pre></article>)}</div></div>}
    <footer>{tr("Read only ·")}{' '}{model.document.format} · {model.document.cues.length} {' '}{tr("cues · plain text, no subtitle scripts or effects")}</footer>
  </section>;
}
export const subtitleViewerPlugin:ViewerPlugin<Model,Model>={id:'subtitle',name:'Subtitles',supportedTypes:[],capabilities:{inspect:true},inspect:m=>m,load:async c=>{
  if(await c.source.getSize()>4*1024*1024)throw Error('Resource Limit Exceeded: subtitle preview is limited to 4 MiB; use Text or Hex');
  const source=await c.source.readText({maxBytes:4*1024*1024});checkAbort(c.signal);const format=c.file.format?.formatId??'srt';
  try{return {source,document:parseSubtitles(source,format)};}catch(e){return {source,document:{cues:[],warnings:[],styles:[],format},error:String(e)};}
},render:p=><SubtitleViewer {...p}/>,renderInspection:(m)=><div><p>{m.document.cues.length} {' '}{tr("cues")}</p>{m.document.styles.map((s,i)=><pre key={i}>{s}</pre>)}</div>};
