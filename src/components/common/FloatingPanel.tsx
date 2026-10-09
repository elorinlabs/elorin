import { t as tr, useUiLanguage as useLocale } from '../../i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Pin, GripHorizontal } from 'lucide-react';
import { placeLayer } from './layer-layout';
interface Layer {id:symbol;element:HTMLElement}
const layers:Layer[]=[];
function reorder(layer:Layer){const index=layers.indexOf(layer);if(index>=0)layers.splice(index,1);layers.push(layer);layers.forEach((item,i)=>item.element.style.setProperty('--panel-order',String(i)));}
type SavedLayer={left:number;top:number;pinned:boolean;collapsed:boolean};
const objectLayouts=new WeakMap<object,Map<string,SavedLayer>>(),stringLayouts=new Map<string,Map<string,SavedLayer>>();
function layouts(owner:object|string){const cache=typeof owner==='object'?objectLayouts:stringLayouts;let value=cache.get(owner as never);if(!value){value=new Map();if(typeof owner==='string'&&stringLayouts.size>=32)stringLayouts.delete(stringLayouts.keys().next().value!);cache.set(owner as never,value);}return value;}
export function clampPanel(left:number,top:number,width:number,height:number,viewportWidth=innerWidth,viewportHeight=innerHeight){return{left:Math.max(8,Math.min(left,Math.max(8,viewportWidth-width-16))),top:Math.max(40,Math.min(top,Math.max(40,viewportHeight-height-16)))};}
export function FloatingPanel({title,owner,close,children,anchor,anchorElement,initial,width=330,layoutId}: {title:string;owner:object|string;close:()=>void;children:ReactNode;anchor?:DOMRect;anchorElement?:HTMLElement|null;initial?:{left:number;top:number};width?:number;layoutId?:string}){
 useLocale();const key=layoutId??title,saved=layouts(owner).get(key);
 const panel=useRef<HTMLDivElement>(null),header=useRef<HTMLElement>(null),callback=useRef(close),layer=useRef<Layer|null>(null),returnFocus=useRef<HTMLElement|null>(null);
 const [pinned,setPinned]=useState(saved?.pinned??false),[collapsed,setCollapsed]=useState(saved?.collapsed??false),[position,setPosition]=useState(saved?{left:saved.left,top:saved.top}:initial??{left:anchor?.left??Math.max(8,innerWidth-width-24),top:anchor?.bottom??100});
 const positionRef=useRef(position);positionRef.current=position;
 const pinnedRef=useRef(pinned),manual=useRef(!!saved||!!initial),drag=useRef<{x:number;y:number;left:number;top:number;pointer:number}|undefined>(undefined);callback.current=close;pinnedRef.current=pinned;
 const modal=()=>!!document.querySelector('[aria-modal="true"],[role="dialog"],[role="alertdialog"]');
 const endDrag=()=>{const id=drag.current?.pointer;drag.current=undefined;if(id!==undefined&&header.current?.hasPointerCapture?.(id))header.current.releasePointerCapture(id);};
 const move=(left:number,top:number)=>{const rect=panel.current?.getBoundingClientRect();if(!rect)return;const next=clampPanel(left,top,rect.width,rect.height);setPosition(v=>v.left===next.left&&v.top===next.top?v:next);};
 useEffect(()=>{const map=layouts(owner);if(map.size>=16&&!map.has(key))map.delete(map.keys().next().value!);map.set(key,{...position,pinned,collapsed});window.dispatchEvent(new Event('elorin-scroll-metrics'));},[owner,key,position,pinned,collapsed]);
 useEffect(()=>{
  const element=panel.current!;const item={id:Symbol(key),element};layer.current=item;returnFocus.current=(anchorElement??document.activeElement) as HTMLElement;reorder(item);
  const keydown=(e:KeyboardEvent)=>{if(e.key!=='Escape'||e.defaultPrevented||layers.at(-1)!==item||modal()||document.querySelector('[role="menu"]'))return;e.preventDefault();e.stopImmediatePropagation();callback.current();};
  const outside=(e:PointerEvent)=>{const target=e.target as Element;if(modal()||layers.at(-1)!==item||pinnedRef.current||element.contains(target)||target.closest('.floating-panel,[role="menu"],[data-floating-trigger],[data-overlay-scrollbar]'))return;callback.current();};
  const inactive=(e:Event)=>{if((e as CustomEvent).detail?.source===owner)callback.current();};
  window.addEventListener('elorin-viewer-inactive',inactive);
  window.addEventListener('keydown',keydown,true);window.addEventListener('pointerdown',outside);element.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled)')?.focus({preventScroll:true});if(!element.contains(document.activeElement))element.focus({preventScroll:true});
  return()=>{endDrag();const top=layers.at(-1)===item,index=layers.indexOf(item);if(index>=0)layers.splice(index,1);layer.current=null;window.removeEventListener('elorin-viewer-inactive',inactive);window.removeEventListener('keydown',keydown,true);window.removeEventListener('pointerdown',outside);if(top&&!modal()){const previous=returnFocus.current;const target=previous?.isConnected&&previous!==document.body&&!previous.closest('[hidden],[inert]')?previous:document.querySelector<HTMLElement>('[data-elorin-tab][data-active="true"] button,.focus-reading-surface');target?.focus({preventScroll:true});}};
 },[owner,key,anchorElement]);
 useLayoutEffect(()=>{
  let frame=0;const target=anchorElement;const update=()=>{frame=0;const r=panel.current?.getBoundingClientRect();if(!r)return;
   if(target&&!manual.current){const a=target.getBoundingClientRect();if(!target.isConnected||a.bottom<0||a.top>innerHeight){if(!pinnedRef.current)callback.current();return;}const next=placeLayer(a,r.width,r.height);move(next.left,next.top);}else move(positionRef.current.left,positionRef.current.top);
  };const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(update);};
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(schedule);observer?.observe(panel.current!);if(target)observer?.observe(target);window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.addEventListener('elorin-scroll-metrics',schedule);update();
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.removeEventListener('elorin-scroll-metrics',schedule);};
 },[anchorElement,owner,key]);
 const raise=()=>{if(layer.current&&!modal())reorder(layer.current);};
 return createPortal(<div ref={panel} role="region" aria-label={title} tabIndex={-1} className="floating-panel" data-layer="panel" style={{...position,width}} onPointerDownCapture={raise} onFocusCapture={raise}>
  <header ref={header} tabIndex={0} aria-label={tr('Move {v0} with arrow keys',{v0:title})} onKeyDown={e=>{const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key as 'ArrowLeft'];if(!delta||e.target!==e.currentTarget)return;e.preventDefault();manual.current=true;move(position.left+delta[0],position.top+delta[1]);}} onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button,input,select'))return;e.preventDefault();e.stopPropagation();manual.current=true;drag.current={x:e.clientX,y:e.clientY,...position,pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d)return;e.stopPropagation();move(d.left+e.clientX-d.x,d.top+e.clientY-d.y);}} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={()=>{drag.current=undefined;}}>
   <GripHorizontal size={15}/><strong>{title}</strong><button aria-label={tr('{v0} {v1}',{v0:tr(collapsed?'Expand':'Collapse'),v1:title})} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'+':'−'}</button><button aria-label={tr('Pin {v0}',{v0:title})} aria-pressed={pinned} onClick={()=>setPinned(v=>!v)}><Pin size={14}/></button><button aria-label={tr('Close {v0}',{v0:title})} onClick={close}><X size={15}/></button>
  </header><div className="floating-panel-content" hidden={collapsed}>{children}</div>
 </div>,document.body);
}
