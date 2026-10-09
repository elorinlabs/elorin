import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import type { ViewerRenderProps, ViewerPlugin } from '../core/types';
import { useUiSettings } from '../../platform/ui-settings';
import { documentSessions } from '../../document/session';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
export interface StatusItem{id:string;label:string;value:string;priority:number}
export function statusPresentation(items:StatusItem[], mode:string, focus:boolean, contextual:boolean, media=false){
 const displayed=mode==='hide'||media?items.filter(item=>item.priority>=3):items;
 return {displayed,visible:displayed.some(item=>item.priority>=3)||(mode!=='hide'&&!media&&((!focus&&mode==='show')||contextual))};
}
export function statusItems(pluginId:string,props:ViewerRenderProps):StatusItem[]{
 const m=props.session.metadata,model=props.model as Record<string,any>,items:StatusItem[]=[];
 const push=(id:string,label:string,value:unknown,priority=0)=>{if(value!==undefined&&value!==null&&value!=='')items.push({id,label:tr(label),value:String(value),priority});};
 const edited=documentSessions.get(props.context.source);push('mode','',tr(edited?.dirty?'Modified':edited?'Editing':'Read only'),edited?.dirty?3:2);
 if(pluginId==='pdf'){push('page','Page',m.pdfPage&&model.document?.numPages?`${m.pdfPage} / ${model.document.numPages}`:m.pdfPage);const zoom=m.pdfEffectiveZoom??m.pdfZoom;push('zoom','Zoom',typeof zoom==='number'?`${Math.round(zoom*100)}%`:undefined);}
 if(['core.text-fallback','text','markdown','json'].includes(pluginId)){push('encoding','Encoding',model.encoding);push('eol','Line endings',model.lineEndings);push('line','Line',m.textSelected&&typeof m.textSelected==='object'?(m.textSelected as {number:number}).number:undefined);push('column','Column',typeof m.textColumn==='number'?m.textColumn+1:undefined);}
 if(pluginId==='csv'){const selection=m.csvSelection as {kind?:string;row?:number;column?:number}|undefined;push('cell','Cell',selection?.kind==='cell'?`${columnName(selection.column??0)}${(selection.row??0)+1}`:undefined);const rows=model.rowSource?.count;push('rows','Rows',typeof rows==='number'?`${Math.max(0,rows-((m.csvHeader??model.dialect?.detectedHeader)?1:0))}${model.status==='complete'?'':'+'}`:undefined);push('columns','Columns',model.columns?.length);push('filter','',m.csvFilter?tr('Filtered'):undefined);}
 if(pluginId==='archive'){push('entries','Items',model.info?.entries??model.entries?.size);push('selected','Selected',Array.isArray(m.selection)?m.selection.length:undefined);if(model.info&&!model.info.complete&&!model.error)push('task','',tr('Indexing archive… {v0} entries discovered',{v0:model.info.entries}),4);}
 if(['mesh','cad','scene','cad-drawing'].includes(pluginId)){push('units','Units',model.document?.units==='unknown'?undefined:model.document?.units);push('selected','Selected',model.selected?1:undefined);push('objects','Objects',model.document?.nodes?.length);}
 if(pluginId==='hex'||pluginId==='core.binary-fallback'){push('offset','Offset',m.hexOffset);}
 if(model.busy||model.status==='loading'||model.status==='indexing'||(pluginId==='pdf'&&model.loading&&!model.document&&!model.error))push('task','',typeof model.progress==='string'?tr(model.progress):tr('Loading…'),4);
 const error=model.error??model.document?.error;
 if(error)push('error','',tr(typeof error==='string'?error:error.message??'Viewer error'),5);
 return items.sort((a,b)=>b.priority-a.priority);
}
export function columnName(index:number){let value=index+1,text='';while(value>0){value--;text=String.fromCharCode(65+value%26)+text;value=Math.floor(value/26);}return text;}
export function ContextualStatus({plugin,props,children}:{plugin:ViewerPlugin;props:ViewerRenderProps;children?:ReactNode}) {
  useLocale();
 const settings=useUiSettings();
 const focus=new URLSearchParams(location.search).get('window')==='focus';
 const store=useMemo(()=>{const model=props.model as {subscribe?:(fn:()=>void)=>()=>void;snapshot?:()=>unknown};return{subscribe:typeof model?.subscribe==='function'&&typeof model?.snapshot==='function'?model.subscribe.bind(model):()=>()=>{},snapshot:typeof model?.snapshot==='function'?model.snapshot.bind(model):()=>0};},[props.model]);
 useSyncExternalStore(store.subscribe,store.snapshot);
 const [revealed,setRevealed]=useState(false),[atBottom,setAtBottom]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const items=statusItems(plugin.id,props);
 const signature=items.filter(i=>i.priority<3).map(i=>`${i.id}:${i.value}`).join('|');
 const previous=useRef(signature);
 useEffect(()=>{
   setRevealed(false);setAtBottom(false);previous.current=signature;
   return()=>clearTimeout(timer.current);
 },[props.context.source,plugin.id]);
 useEffect(()=>{
   const reveal=()=>{clearTimeout(timer.current);setRevealed(true);timer.current=setTimeout(()=>setRevealed(false),2500);};
   const move=(event:PointerEvent)=>setAtBottom(event.clientY>=innerHeight-48);
   const key=(event:KeyboardEvent)=>{if(event.key==='F6'&&event.shiftKey&&!event.defaultPrevented){event.preventDefault();reveal();}};
   const hidden=()=>{if(document.hidden){clearTimeout(timer.current);setRevealed(false);setAtBottom(false);}};
   window.addEventListener('pointermove',move);window.addEventListener('keydown',key);
   window.addEventListener('elorin-status-reveal',reveal);document.addEventListener('visibilitychange',hidden);
   return()=>{clearTimeout(timer.current);window.removeEventListener('pointermove',move);window.removeEventListener('keydown',key);window.removeEventListener('elorin-status-reveal',reveal);document.removeEventListener('visibilitychange',hidden);};
 },[props.context.source,plugin.id]);
 useEffect(()=>{
   if(previous.current===signature)return;
   previous.current=signature;clearTimeout(timer.current);setRevealed(true);
   timer.current=setTimeout(()=>setRevealed(false),2500);
 },[signature]);
 const media=plugin.id==='audio'||plugin.id==='video';
 const {displayed,visible}=statusPresentation(items,settings.statusBar,focus,revealed||atBottom,media);
 if(!displayed.length)return null;
 return <div className="ui-context-status" aria-label={tr("Viewer status")} data-visible={visible} aria-hidden={!visible}>
   {settings.statusBar!=='hide'&&!media&&children}
   {displayed.map(item=><span key={item.id} role={item.priority===5?'alert':item.priority>=3?'status':undefined} title={tr("{v0} {v1}", { v0: item.label, v1: item.value })}>{item.label&&tr("{v0} ", { v0: item.label })}{item.value}</span>)}
 </div>;
}
