import { useLayoutEffect, type RefObject } from 'react';
export function placeLayer(anchor: Pick<DOMRect, 'left'|'top'|'bottom'>, width:number, height:number, viewportWidth=innerWidth, viewportHeight=innerHeight, gap=6) {
 const left=Math.max(8,Math.min(anchor.left,viewportWidth-width-8)),below=anchor.bottom+gap;
 return {left,top:Math.max(8,Math.min(below+height>viewportHeight-8?anchor.top-height-gap:below,viewportHeight-height-8))};
}
/** Existing portals share positioning; there is no polling loop. */
export function useAnchoredPosition(open:boolean, anchor:RefObject<HTMLElement|null>, panel:RefObject<HTMLElement|null>, move:(point:{left:number;top:number})=>void, close:()=>void) {
 useLayoutEffect(()=>{
  if(!open||!anchor.current||!panel.current)return;
  const target=anchor.current,element=panel.current;let frame=0;
  const update=()=>{frame=0;if(!target.isConnected){close();return;}const a=target.getBoundingClientRect(),p=element.getBoundingClientRect();if(a.bottom<0||a.top>innerHeight||a.right<0||a.left>innerWidth){close();return;}move(placeLayer(a,p.width,p.height));};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(schedule);observer?.observe(target);observer?.observe(element);
  const visibility=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{if(entries.some(entry=>!entry.isIntersecting))close();});visibility?.observe(target);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);update();
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();visibility?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);};
 },[open,anchor,panel,move,close]);
}
