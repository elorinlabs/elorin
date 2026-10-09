import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewFileDialog } from '../src/document/NewFileDialog';
import { documentFileName, validateDocumentName } from '../src/document/create-options';
import { App } from '../src/app/App';
import { documentSessions } from '../src/document/session';
import { File as NodeFile } from 'node:buffer';
const native = vi.hoisted(() => ({ enabled: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled, invoke: native.invoke }));
vi.mock('../src/document/clipboard', () => ({ readClipboard: vi.fn(async () => '{"x":1}'), writeClipboard: vi.fn() }));
afterEach(() => { native.enabled = false; native.invoke.mockReset(); documentSessions.clear(); vi.unstubAllGlobals(); });
describe('New file modal', () => {
  it('filters formats, shows examples and disables creation for empty results', async () => {
    const user = userEvent.setup(); render(<NewFileDialog onClose={vi.fn()} onCreate={vi.fn()}/>);
    expect(screen.getByLabelText('File name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.queryByRole('button', { name: /Plain Text/ })).toBeNull();
    await user.type(screen.getByLabelText('Search formats'), 'csv');
    expect(screen.getByLabelText('CSV example')).toHaveTextContent('Alice,26,New York');
    await user.clear(screen.getByLabelText('Search formats')); await user.type(screen.getByLabelText('Search formats'), 'xml');
    expect(screen.getByText('No file formats found')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Clear format search' })); expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });
  it('validates names, prevents collisions and keeps failed creation open', async () => {
    const user = userEvent.setup(), create = vi.fn().mockRejectedValue({ code: 'exists', message: 'Already exists in folder.' }), close = vi.fn();
    render(<NewFileDialog existingNames={['Untitled.txt']} onClose={close} onCreate={create}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('already open');
    await user.clear(screen.getByLabelText('File name')); await user.type(screen.getByLabelText('File name'), '../notes'); expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.clear(screen.getByLabelText('File name')); await user.type(screen.getByLabelText('File name'), 'notes'); await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already exists'); expect(close).not.toHaveBeenCalled();
  });
  it('closes after one successful create and blocks duplicate submissions', async () => {
    let resolve!: () => void; const create = vi.fn(() => new Promise<void>(r => { resolve = r; })), close = vi.fn();
    render(<NewFileDialog onClose={close} onCreate={create}/>);
    const button = screen.getByRole('button', { name: 'Create' }); fireEvent.click(button); fireEvent.click(button);
    expect(create).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => resolve()); expect(close).toHaveBeenCalledTimes(1);
  });
  it('Escape closes the location picker first, supports cancel and backdrop dismissal', async () => {
    const user = userEvent.setup(), close = vi.fn(); render(<NewFileDialog onClose={close} onCreate={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: /Save location/ })); expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}'); expect(screen.queryByRole('menu')).toBeNull(); expect(close).not.toHaveBeenCalled();
    await user.keyboard('{Escape}'); expect(close).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.pointerDown(document.querySelector('.new-file-backdrop')!); expect(close).toHaveBeenCalledTimes(3);
  });
  it('retains clipboard content and selects its detected format', async () => {
    const user = userEvent.setup(), create = vi.fn().mockResolvedValue(undefined); render(<NewFileDialog onClose={vi.fn()} onCreate={create}/>);
    await user.click(screen.getByRole('button', { name: 'From Clipboard' })); expect(screen.getByRole('button', { name: /JSON.*json/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Create' })); expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'json', content: '{"x":1}' }));
  });
  it('checks physical collisions through location tokens', async () => {
    native.enabled = true; native.invoke.mockImplementation(async command => command === 'document_create_locations' ? [{ id: 'token', label: 'Documents', path: 'X:/Documents' }] : false);
    const user = userEvent.setup(); render(<NewFileDialog onClose={vi.fn()} onCreate={vi.fn()}/>);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledWith('document_create_locations'));
    await user.click(screen.getByRole('button', { name: /Save location/ })); await user.click(await screen.findByRole('menuitemradio', { name: 'Documents' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists'); expect(native.invoke).toHaveBeenCalledWith('document_name_available', { location: 'token', name: 'Untitled.txt' });
  });
  it('actual App creates a named tab and removes the modal; all entries can reopen it', async () => {
    vi.stubGlobal('File', NodeFile);
    const user = userEvent.setup(); render(<App mode="browser"/>);
    await user.click(screen.getByRole('button', { name: 'New tab' })); await user.clear(screen.getByLabelText('File name')); await user.type(screen.getByLabelText('File name'), 'Notes');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New File' })).toBeNull()); expect(document.querySelector('.file-tab')).toHaveTextContent('Notes.txt');
    await user.keyboard('{Control>}n{/Control}'); expect(screen.getByRole('dialog', { name: 'New File' })).toBeInTheDocument(); await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog', { name: 'New File' })).toBeNull();
  });
  it('keeps extension and Windows reserved-name rules consistent', () => {
    expect(documentFileName('notes.md', 'markdown')).toBe('notes.md'); expect(documentFileName('data', 'csv')).toBe('data.csv');
    for (const name of ['', '../x', 'CON', 'lpt9.txt', 'name.']) expect(validateDocumentName(name)).toBeTruthy(); expect(validateDocumentName('我的笔记')).toBeUndefined();
  });
});
