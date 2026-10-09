import {afterEach,describe,it,expect,vi} from 'vitest';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {FloatingPanel} from '../src/components/common/FloatingPanel';
import {placeLayer} from '../src/components/common/layer-layout';
import {scrollKey,intersectRect} from '../src/components/common/ScrollbarSystem';
import {PageNavigator,PdfViewer} from '../src/viewer/plugins/pdf/PdfViewer';
afterEach(()=>vi.unstubAllGlobals());
describe('Module 26 floating and scroll boundaries',()=>{
 it('does not republish unchanged PDF commands when the host redraws',()=>{
  const registerActions=vi.fn(()=>vi.fn()),engine={subscribe:()=>()=>{},snapshot:()=>0,cancelSearch:vi.fn(),firstSize:{width:600,height:800},copyAllowed:true};
  const props={model:engine,context:{source:{},registerActions},session:{metadata:{}},updateSession:vi.fn()} as unknown as Parameters<typeof PdfViewer>[0];
  const view=render(<PdfViewer {...props}/>);expect(registerActions).toHaveBeenCalledOnce();
  view.rerender(<PdfViewer {...props} context={{...props.context}}/>);expect(registerActions).toHaveBeenCalledOnce();
 });
 it('flips anchored content above the bottom edge and left of the right edge',()=>{expect(placeLayer({left:980,top:620,bottom:650},330,200,1000,700)).toEqual({left:662,top:414});});
 it('keeps scrollbar keyboard input on the intended axis',()=>{expect(scrollKey('ArrowDown',false,10,100,1000)).toBeUndefined();expect(scrollKey('ArrowRight',true,10,100,1000)).toBeUndefined();expect(scrollKey('ArrowRight',false,10,100,1000)).toBe(50);expect(scrollKey('End',true,10,100,1000)).toBe(1000);expect(scrollKey('PageUp',true,10,100,1000)).toBe(0);});
 it('clips nested overlays to the visible ancestor',()=>{expect(intersectRect({left:0,top:0,right:500,bottom:500},{left:40,top:100,right:300,bottom:400})).toEqual({left:40,top:100,right:300,bottom:400});});
 it('raises an older panel and closes only that panel on Escape',()=>{
  function Pair(){const [a,setA]=useState(true),[b,setB]=useState(true);return <>{a&&<FloatingPanel title="Panel A" owner={{}} close={()=>setA(false)}>A</FloatingPanel>}{b&&<FloatingPanel title="Panel B" owner={{}} close={()=>setB(false)}>B</FloatingPanel>}</>;}
  render(<Pair/>);fireEvent.pointerDown(screen.getByRole('region',{name:'Panel A'}));fireEvent.keyDown(window,{key:'Escape'});expect(screen.queryByRole('region',{name:'Panel A'})).toBeNull();expect(screen.getByRole('region',{name:'Panel B'})).toBeInTheDocument();fireEvent.keyDown(window,{key:'Escape'});expect(screen.queryByRole('region')).toBeNull();
 });
 it('does not dismiss a panel when its overlay scrollbar or modal is used',()=>{
  const close=vi.fn();render(<FloatingPanel title="Tools" owner={{}} close={close}>Tools</FloatingPanel>);
  const bar=document.createElement('div');bar.dataset.overlayScrollbar='true';document.body.append(bar);fireEvent.pointerDown(bar);bar.remove();expect(close).not.toHaveBeenCalled();
  const modal=document.createElement('div');modal.setAttribute('aria-modal','true');document.body.append(modal);fireEvent.pointerDown(document.body);fireEvent.keyDown(window,{key:'Escape'});modal.remove();expect(close).not.toHaveBeenCalled();
 });
 it('reclamps after content resizing and disconnects its observer',()=>{
  let changed:ResizeObserverCallback=()=>{};const disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class {constructor(fn:ResizeObserverCallback){changed=fn;}observe(){}disconnect=disconnect;});
  const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.push(fn);return frames.length;});
  const {unmount}=render(<FloatingPanel title="Growing" owner={{}} close={()=>{}} initial={{left:900,top:650}}>Content</FloatingPanel>);const p=screen.getByRole('region',{name:'Growing'});p.getBoundingClientRect=()=>({width:330,height:350} as DOMRect);
  act(()=>changed([],{} as ResizeObserver));act(()=>frames.shift()?.(0));
  expect(p).toHaveStyle({left:`${innerWidth-330-16}px`,top:`${innerHeight-350-16}px`});
  unmount();expect(disconnect).toHaveBeenCalledOnce();
 });
 it('validates draft pages and commits only on Enter, with Escape cancellation',()=>{
  const go=vi.fn(),close=vi.fn();render(<PageNavigator current={3} count={10} go={go} close={close}/>);const input=screen.getByLabelText('Jump to page');fireEvent.change(input,{target:{value:'99'}});expect(go).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Enter'});expect(screen.getByRole('alert')).toHaveTextContent('1 to 10');expect(input).toHaveAttribute('aria-invalid','true');fireEvent.change(input,{target:{value:'7'}});fireEvent.keyDown(input,{key:'Enter'});expect(go).toHaveBeenCalledWith(7);fireEvent.keyDown(input,{key:'Escape'});expect(close).toHaveBeenCalledOnce();
 });
});
