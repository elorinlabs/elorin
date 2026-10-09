import { describe, expect, it } from 'vitest';
import { statusItems, statusPresentation } from '../src/viewer/components/ContextualStatus';
import type { ViewerRenderProps } from '../src/viewer/core/types';
const props = (model:unknown, metadata:Record<string,unknown> = {}) => ({model,context:{source:{}},session:{metadata}} as ViewerRenderProps);
describe('Module 25 status policies and real model data',()=>{
 it('preserves essential feedback even in hide and media modes',()=>{
  const items=statusItems('pdf',props({error:'Broken PDF',document:{numPages:4}},{pdfPage:2}));
  const result=statusPresentation(items,'hide',true,false,true);
  expect(result.visible).toBe(true);expect(result.displayed.map(i=>i.id)).toEqual(['error']);
 });
 it('distinguishes persistent, contextual, hidden and Focus presentation',()=>{
  const items=statusItems('pdf',props({document:{numPages:4}},{pdfPage:2,pdfZoom:1}));
  expect(statusPresentation(items,'show',false,false).visible).toBe(true);
  expect(statusPresentation(items,'auto',false,false).visible).toBe(false);
  expect(statusPresentation(items,'auto',false,true).visible).toBe(true);
  expect(statusPresentation(items,'show',true,false).visible).toBe(false);
  expect(statusPresentation(items,'hide',false,true).displayed).toEqual([]);
 });
 it('uses parsed archive counts and keeps unfinished indexing visible',()=>{
  const items=statusItems('archive',props({info:{entries:23,complete:false},entries:new Map()}, {selection:['entry-1','entry-2']}));
  expect(items.find(i=>i.id==='entries')?.value).toBe('23');
  expect(items.find(i=>i.id==='selected')?.value).toBe('2');
  expect(statusPresentation(items,'hide',false,false).displayed.map(i=>i.id)).toEqual(['task']);
 });
 it('omits unknown geometry units and unsupported PDF metrics',()=>{
  const items=statusItems('mesh',props({document:{units:'unknown',nodes:[{},{}]}}));
  expect(items.some(i=>i.id==='units')).toBe(false);expect(items.find(i=>i.id==='objects')?.value).toBe('2');
  expect(statusItems('pdf',props({})).some(i=>['page','zoom'].includes(i.id))).toBe(false);
 });
});
