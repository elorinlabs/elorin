import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewerHost } from '../src/viewer/components/ViewerHost';
import { ViewerRegistry } from '../src/viewer/core/registry';
import { viewerCommands } from '../src/commands/viewer-bridge';
import { descriptor, source, testPlugin } from './viewer-helpers';
import type { ViewerRenderProps } from '../src/viewer/core/types';
function Controls({context}:ViewerRenderProps) {
  const [page,setPage]=useState(3);
  useEffect(()=>context.registerActions?.([{id:'zoom',label:'Zoom',action:()=>setPage(page+1)}]));
  return <button onClick={()=>setPage(8)}>Current page {page}</button>;
}
describe('Focus command state',()=>{
  it('uses the latest plugin callback after navigation and releases it on unmount',async()=>{
    const file=descriptor(),owner=source(),registry=new ViewerRegistry();
    registry.register({...testPlugin(),capabilities:{zoom:true},render:props=><Controls {...props}/>});
    const {unmount}=render(<ViewerHost file={file} source={owner} registry={registry}/>);
    fireEvent.click(await screen.findByText('Current page 3'));
    expect(screen.getByText('Current page 8')).toBeInTheDocument();
    act(()=>{void viewerCommands.get(owner).find(a=>a.id==='zoom')?.action();});
    expect(screen.getByText('Current page 9')).toBeInTheDocument();
    act(()=>{void viewerCommands.get(owner).find(a=>a.id==='zoom')?.action();});
    expect(screen.getByText('Current page 10')).toBeInTheDocument();
    unmount();expect(viewerCommands.get(owner)).toEqual([]);
  });
});
