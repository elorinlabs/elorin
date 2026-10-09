import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentDialog, confirmDocument, promptDocument } from '../src/document/dialog';
import { DocumentSession } from '../src/document/session';
import { saveDocument } from '../src/document/save-service';
afterEach(cleanup);
describe('explicit document decisions', () => {
  it('does not treat an unresolved confirmation as consent', async () => { render(<DocumentDialog/>); let resolved=false; let promise!:Promise<boolean>; act(()=>{promise=confirmDocument('Overwrite?'); promise.then(()=>resolved=true);}); expect(resolved).toBe(false); fireEvent.click(screen.getByRole('button',{name:'Cancel'})); await expect(promise).resolves.toBe(false); });
  it('accepts only the explicit affirmative choice', async () => { render(<DocumentDialog/>); let promise!:Promise<boolean>; act(()=>{promise=confirmDocument('Overwrite?');}); fireEvent.click(screen.getByRole('button',{name:'Continue'})); await expect(promise).resolves.toBe(true); });
  it('returns literal prompt text', async()=>{ render(<DocumentDialog/>); let promise!:Promise<string|null>; act(()=>{promise=promptDocument('Column name','Column 2');}); fireEvent.change(screen.getByLabelText('Document dialog input'),{target:{value:'重复列名'}}); fireEvent.click(screen.getByRole('button',{name:'Confirm'})); await expect(promise).resolves.toBe('重复列名'); });
  it('cancelling invalid JSON save keeps the document unsaved', async()=>{render(<DocumentDialog/>); const session=new DocumentSession('{"x":','json'); let operation!:ReturnType<typeof saveDocument>; act(()=>{operation=saveDocument(session,'Untitled.json');}); expect(screen.getByRole('alertdialog')).toHaveTextContent('JSON is invalid'); fireEvent.click(screen.getByRole('button',{name:'Cancel'})); await expect(operation).resolves.toBeNull(); expect(session.dirty).toBe(true); expect(session.saveState).toBe('Unsaved');});
});
