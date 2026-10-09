import { useEffect, useState } from 'react';
import { t, useUiLanguage } from '../../i18n';
import { useUiSettings } from '../../platform/ui-settings';
export function thumbMetrics(viewport:number,content:number,offset:number,track:number){const max=Math.max(0,content-viewport),size=Math.min(track,Math.max(24,track*(content?viewport/content:1))),travel=Math.max(0,track-size);return{max,size,travel,position:max?Math.max(0,Math.min(max,offset))/max*travel:0};}
export function scrollKey(key:string,vertical:boolean,current:number,viewport:number,max:number){const value=key==='Home'?0:key==='End'?max:key==='PageDown'?current+viewport:key==='PageUp'?current-viewport:key===(vertical?'ArrowDown':'ArrowRight')?current+40:key===(vertical?'ArrowUp':'ArrowLeft')?current-40:undefined;return value===undefined?undefined:Math.max(0,Math.min(max,value));}
export function intersectRect(a:{left:number;top:number;right:number;bottom:number},b:{left:number;top:number;right:number;bottom:number}){return{left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)};}
const selector='.workspace>main,.sidebar,.settings-nav,.settings-page,.viewer-scroll,.viewer-panel,.pdf-viewport,.document-sidebar,.pdf-thumbnails,.pdf-outline,.text-viewport,.markdown-reader,.markdown-source,.markdown-reader-pane,.markdown-source-pane,.json-tree,.json-source,.csv-grid,.m10-grid,.archive-list,.archive-results,.geometry-tree,.data-tree,.data-grid,.m11-reading,.floating-panel-content,.top-file-tabs';
type Owner={element:HTMLElement;measure:(rects:Map<Element,DOMRect>)=>(()=>void);release:()=>void;schedule:()=>void};
/** Existing scroll owners, batched layout reads before overlay writes. No idle loop. */
export function ScrollbarSystem(){const preferences=useUiSettings(),language=useUiLanguage();const [forced,setForced]=useState(()=>matchMedia('(forced-colors: active)').matches);
 useEffect(()=>{const query=matchMedia('(forced-colors: active)'),change=()=>setForced(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 useEffect(()=>{
  if(forced)return;
  const owners=new Map<HTMLElement,Owner>(),dirty=new Set<Owner>();let frame=0,discovery=0,closed=false;
  const flush=()=>{frame=0;if(document.hidden)return;const rects=new Map<Element,DOMRect>(),writes=[...dirty].filter(o=>o.element.isConnected).map(o=>o.measure(rects));dirty.clear();writes.forEach(write=>write());};
  const queue=(owner:Owner)=>{dirty.add(owner);if(!frame&&!document.hidden)frame=requestAnimationFrame(flush);};
  const all=()=>{for(const owner of owners.values())owner.schedule();};
  const attach=(element:HTMLElement):Owner=>{
   let geometryDirty=true,cachedRect:DOMRect|undefined,cachedClip:{left:number;top:number;right:number;bottom:number}|undefined;
   const ancestors:HTMLElement[]=[];for(let p=element.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(['hidden','clip','auto','scroll'].some(v=>s.overflowX===v||s.overflowY===v))ancestors.push(p);}
   const id=element.id||`elorin-scroll-${crypto.randomUUID()}`,assigned=!element.id;if(assigned)element.id=id;
   const nodes=(['y','x'] as const).map(axis=>{const track=document.createElement('div'),thumb=document.createElement('span');track.className=`art-scrollbar art-scrollbar-${axis}`;track.dataset.overlayScrollbar='true';track.dataset.scrollOwner=id;track.setAttribute('role','scrollbar');track.setAttribute('aria-controls',id);track.setAttribute('aria-orientation',axis==='y'?'vertical':'horizontal');track.setAttribute('aria-label',`${element.getAttribute('aria-label')??t('File preview')} ${t(axis==='y'?'Vertical scroll':'Horizontal scroll')}`);track.setAttribute('aria-valuemin','0');track.tabIndex=0;track.appendChild(thumb);document.body.appendChild(track);return{axis,track,thumb,drag:undefined as {start:number;offset:number;pointer:number}|undefined,metrics:thumbMetrics(0,0,0,0),start:0,last:{geometry:'',max:-1,offset:-1,size:-1,position:-1}};});
   const rect=(e:Element,cache:Map<Element,DOMRect>)=>{let r=cache.get(e);if(!r){r=e.getBoundingClientRect();cache.set(e,r);}return r;};
   const releases:(()=>void)[]=[];
   const owner:Owner={element,schedule:()=>{geometryDirty=true;queue(owner);},measure:cache=>{
    if(geometryDirty||!cachedRect||!cachedClip){cachedRect=rect(element,cache);const r=cachedRect;cachedClip={left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)};for(const a of ancestors)cachedClip=intersectRect(cachedClip,rect(a,cache));geometryDirty=false;}
    const r=cachedRect,clip=cachedClip;
    const hidden=!!element.closest('[hidden],[inert]')||r.width===0||r.height===0||clip.right<=clip.left||clip.bottom<=clip.top;
    const hasY=element.scrollHeight-element.clientHeight>1,hasX=element.scrollWidth-element.clientWidth>1,panel=element.closest<HTMLElement>('.floating-panel');
    const order=panel?Number(panel.style.getPropertyValue('--panel-order'))||0:0;
    const values=nodes.map(n=>{const vertical=n.axis==='y',view=vertical?element.clientHeight:element.clientWidth,content=vertical?element.scrollHeight:element.scrollWidth,offset=vertical?element.scrollTop:element.scrollLeft,length=Math.max(0,(vertical?clip.bottom-clip.top:clip.right-clip.left)-((vertical?hasX:hasY)?14:0));return{n,vertical,offset,length,metrics:thumbMetrics(view,content,offset,length),visible:!hidden&&(vertical?hasY:hasX)};});
    return()=>{for(const v of values){const {n,vertical,metrics}=v;n.metrics=metrics;n.start=vertical?clip.top:clip.left;if(n.track.hidden===v.visible)n.track.hidden=!v.visible;
     const geometry=[clip.left,clip.top,clip.right,clip.bottom,v.length,panel?order:-1].join(':');
     if(n.last.geometry!==geometry){n.track.style.left=(vertical?clip.right-14:clip.left)+'px';n.track.style.top=(vertical?clip.top:clip.bottom-14)+'px';n.track.style.width=(vertical?14:v.length)+'px';n.track.style.height=(vertical?v.length:14)+'px';n.track.style.zIndex=panel?`calc(var(--z-panel) + ${order+1})`:'var(--z-scrollbar)';n.last.geometry=geometry;}
     if(n.last.max!==metrics.max){n.track.setAttribute('aria-valuemax',String(metrics.max));n.last.max=metrics.max;}
     const offset=Math.round(v.offset);if(n.last.offset!==offset){n.track.setAttribute('aria-valuenow',String(offset));n.last.offset=offset;}
     if(n.last.size!==metrics.size){n.thumb.style[vertical?'height':'width']=metrics.size+'px';n.last.size=metrics.size;}
     if(n.last.position!==metrics.position){n.thumb.style.transform=vertical?`translateY(${metrics.position}px)`:`translateX(${metrics.position}px)`;n.last.position=metrics.position;}
    }}
   },release:()=>{observe.disconnect();element.classList.remove('art-scroll-owner');element.removeEventListener('scroll',ownScroll);if(assigned&&element.id===id)element.removeAttribute('id');dirty.delete(owner);releases.forEach(fn=>fn());}};
   const ownScroll=()=>queue(owner);
   const observe=new ResizeObserver(owner.schedule);observe.observe(element);if(element.firstElementChild)observe.observe(element.firstElementChild);
   for(const n of nodes){const vertical=n.axis==='y',coordinate=(e:PointerEvent)=>vertical?e.clientY:e.clientX,set=(v:number)=>{if(vertical)element.scrollTop=v;else element.scrollLeft=v;queue(owner);};
    const end=()=>{const pointer=n.drag?.pointer;n.drag=undefined;delete n.track.dataset.dragging;if(pointer!==undefined&&n.track.hasPointerCapture?.(pointer))n.track.releasePointerCapture(pointer);};
    const down=(e:PointerEvent)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const m=n.metrics;if(e.target!==n.thumb)set(m.travel?(coordinate(e)-n.start-m.size/2)/m.travel*m.max:0);n.drag={start:coordinate(e),offset:vertical?element.scrollTop:element.scrollLeft,pointer:e.pointerId};n.track.dataset.dragging='true';n.track.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>{if(!n.drag)return;e.stopPropagation();const m=n.metrics;set(n.drag.offset+(m.travel?(coordinate(e)-n.drag.start)/m.travel*m.max:0));};
    const key=(e:KeyboardEvent)=>{const value=scrollKey(e.key,vertical,vertical?element.scrollTop:element.scrollLeft,vertical?element.clientHeight:element.clientWidth,n.metrics.max);if(value!==undefined){e.preventDefault();e.stopPropagation();set(value);}};
    const wheel=(e:WheelEvent)=>{const delta=vertical?e.deltaY:e.deltaX||e.deltaY;if(!delta)return;e.preventDefault();set((vertical?element.scrollTop:element.scrollLeft)+delta*(e.deltaMode===1?20:e.deltaMode===2?(vertical?element.clientHeight:element.clientWidth):1));};
    n.track.addEventListener('pointerdown',down);n.track.addEventListener('pointermove',move);n.track.addEventListener('pointerup',end);n.track.addEventListener('pointercancel',end);n.track.addEventListener('lostpointercapture',end);n.track.addEventListener('keydown',key);n.track.addEventListener('wheel',wheel,{passive:false});
    releases.push(()=>{end();n.track.removeEventListener('pointerdown',down);n.track.removeEventListener('pointermove',move);n.track.removeEventListener('pointerup',end);n.track.removeEventListener('pointercancel',end);n.track.removeEventListener('lostpointercapture',end);n.track.removeEventListener('keydown',key);n.track.removeEventListener('wheel',wheel);n.track.remove();});
   }
   element.classList.add('art-scroll-owner');element.addEventListener('scroll',ownScroll,{passive:true});owner.schedule();return owner;
  };
  const discover=()=>{discovery=0;if(closed)return;for(const [e,o]of owners)if(!e.isConnected){o.release();owners.delete(e);}if(document.hidden)return;for(const e of document.querySelectorAll<HTMLElement>(selector)){if(owners.has(e))continue;const s=getComputedStyle(e);if(['auto','scroll'].includes(s.overflowY)||['auto','scroll'].includes(s.overflowX))owners.set(e,attach(e));}};
  const scan=()=>{if(!discovery&&!document.hidden)discovery=requestAnimationFrame(discover);};
  const mutation=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'&&!(r.target as Element).closest('[data-overlay-scrollbar]')))all();if(records.some(r=>r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n instanceof Element&&(n.matches(selector)||!!n.querySelector(selector)))))scan();});
  mutation.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert','data-visible']});
  const scroll=(e:Event)=>{if(e.target instanceof Element)for(const o of owners.values())if(e.target!==o.element&&e.target.contains(o.element))o.schedule();};
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;for(const o of owners.values())for(const n of document.querySelectorAll<HTMLElement>(`[data-scroll-owner="${o.element.id}"]`))n.hidden=true;}else{scan();all();}};
  window.addEventListener('resize',all);window.addEventListener('scroll',scroll,true);window.addEventListener('elorin-scroll-metrics',all);document.addEventListener('visibilitychange',visibility);scan();
  return()=>{closed=true;cancelAnimationFrame(frame);cancelAnimationFrame(discovery);mutation.disconnect();window.removeEventListener('resize',all);window.removeEventListener('scroll',scroll,true);window.removeEventListener('elorin-scroll-metrics',all);document.removeEventListener('visibilitychange',visibility);for(const o of owners.values())o.release();owners.clear();dirty.clear();};
 },[preferences.scrollbar,language,forced]);return null;
}
