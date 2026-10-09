import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { semanticColors, tokens, applyTokens } from '../src/design-system/tokens';
import { typography } from '../src/design-system/typography';
import { Button, Input, Switch, Tabs, Dropdown, Tooltip, IconButton, ScrollArea, Progress } from '../src/components/common/ui';
import { PrismTitleBar } from '../src/components/shell/PrismTitleBar';
import { windowAdapter } from '../src/services/windowAdapter';
import { setUiLanguage, useUiLanguage } from '../src/design-system/locale';
import * as core from '@tauri-apps/api/core';
import * as windowApi from '@tauri-apps/api/window';
vi.mock('@tauri-apps/api/core', {spy:true});
vi.mock('@tauri-apps/api/window', {spy:true});
function contrast(a: string, b: string) { const l = (s: string) => { const c = [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }; return (Math.max(l(a), l(b)) + .05) / (Math.min(l(a), l(b)) + .05); }
afterEach(() => { vi.restoreAllMocks(); setUiLanguage('en'); });
describe('Module 24 semantic foundation', () => {
    it.each(['light', 'dark'] as const)('%s has complete, usable and independently applied tokens', mode => {
        expect(Object.keys(semanticColors[mode])).toEqual(Object.keys(semanticColors.light));
        applyTokens(mode);
        for (const [name, value] of Object.entries(semanticColors[mode])) {
            expect(value).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/i);
            expect(document.documentElement.style.getPropertyValue('--' + name)).toBe(value);
        }
        for (const key of ['text-primary', 'text-secondary', 'text-muted', 'success', 'warning', 'danger'] as const)
            expect(contrast(semanticColors[mode][key], semanticColors[mode]['surface-primary'])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(semanticColors[mode]['on-accent'], semanticColors[mode]['accent-primary'])).toBeGreaterThanOrEqual(4.5);
    });
    it('uses a four pixel scale, ordered layers, sans and Chinese/system fallbacks', () => {
        expect(tokens.space).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
        expect(Object.values(tokens.layers)).toEqual([...Object.values(tokens.layers)].sort((a, b) => a - b));
        expect(typography.body).toContain('Microsoft YaHei UI');
        expect(typography.body).toContain('system-ui');
        expect(typography.display).toBe(typography.body);
    });
    it('resolves every variable referenced by the new foundation CSS', () => {
        applyTokens();
        const css = readFileSync('src/design-system/system.css', 'utf8');
        const local = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
        for (const match of css.matchAll(/var\((--[\w-]+)/g))
            expect(local.has(match[1]) || document.documentElement.style.getPropertyValue(match[1]) !== '', match[1]).toBe(true);
        expect(css).not.toMatch(/(?:99999|requestAnimationFrame|backdrop-filter\s*:)/);
        expect(css).toContain('prefers-reduced-motion');
        expect(css).toContain('forced-colors');
    });
});
describe('Module 24 controls', () => {
    it('activates by keyboard and blocks disabled/loading actions', async () => { const user = userEvent.setup(), click = vi.fn(); render(<><Button onClick={click}>Run</Button><Button disabled onClick={click}>Disabled</Button><Button loading onClick={click}>Busy</Button></>); await user.tab(); expect(screen.getByText('Run')).toHaveFocus(); await user.keyboard('{Enter} '); expect(click).toHaveBeenCalledTimes(2); await user.click(screen.getByText('Disabled')); await user.click(screen.getByText('Busy')); expect(click).toHaveBeenCalledTimes(2); expect(screen.getByText('Busy')).toHaveAttribute('aria-busy', 'true'); });
    it('exposes errors and a correctly labelled native scroll surface/progress', () => { render(<><Input aria-label="Value" invalid/><ScrollArea variant="data" aria-label="Data">Rows</ScrollArea><Progress value={150} label="Progress"/></>); expect(screen.getByLabelText('Value')).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByLabelText('Data')).toHaveAttribute('tabindex', '0'); expect(screen.getByLabelText('Data')).toHaveAttribute('data-scroll', 'data'); expect(screen.getByLabelText('Progress')).toHaveAttribute('value', '100'); });
    it('switch uses native Space and Enter keyboard activation', async () => { const user = userEvent.setup(), change = vi.fn(); render(<Switch checked={false} onCheckedChange={change}>Sidebar</Switch>); await user.tab(); await user.keyboard(' {Enter}'); expect(change.mock.calls).toEqual([[true], [true]]); expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'); });
    it('tabs skip disabled options and support Home/End', async () => { const user = userEvent.setup(), change = vi.fn(); render(<Tabs options={[{ id: 'one', label: 'One' }, { id: 'two', label: 'Two', disabled: true }, { id: 'three', label: 'Three' }]} value="one" onChange={change} label="Views"/>); await user.tab(); await user.keyboard('{ArrowRight}'); expect(change).toHaveBeenLastCalledWith('three'); expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus(); await user.keyboard('{Home}'); expect(change).toHaveBeenLastCalledWith('one'); await user.keyboard('{End}'); expect(change).toHaveBeenLastCalledWith('three'); });
    it('menu skips disabled items, selects, dismisses and restores focus', async () => { const user = userEvent.setup(), select = vi.fn(); render(<Dropdown label="Actions" items={[{ id: 'a', label: 'First', onSelect: select }, { id: 'b', label: 'Blocked', disabled: true, onSelect: select }, { id: 'c', label: 'Last', onSelect: select }]}/>); const trigger = screen.getByRole('button', { name: 'Actions' }); await user.click(trigger); expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus(); await user.keyboard('{ArrowDown}'); expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus(); await user.keyboard('{Enter}'); expect(select).toHaveBeenCalledTimes(1); expect(trigger).toHaveFocus(); expect(screen.queryByRole('menu')).toBeNull(); await user.click(trigger); await user.keyboard('{Escape}'); expect(trigger).toHaveFocus(); await user.click(trigger); fireEvent.pointerDown(document.body); expect(screen.queryByRole('menu')).toBeNull(); });
    it('tooltip is associated with focused control and Escape dismisses it', async () => { const user = userEvent.setup(); render(<Tooltip label="Add a file"><IconButton aria-label="Add">+</IconButton></Tooltip>); await user.tab(); expect(screen.getByRole('button')).toHaveAccessibleDescription('Add a file'); await user.keyboard('{Escape}'); expect(screen.queryByRole('tooltip')).toBeNull(); });
    it('updates bilingual labels, including when storage is unavailable', () => { function Language() { return <span>{useUiLanguage()}</span>; } render(<Language />); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Unavailable'); }); vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Unavailable'); }); act(() => setUiLanguage('zh')); expect(screen.getByText('zh')).toBeInTheDocument(); expect(document.documentElement.lang).toBe('zh-CN'); });
});
describe('Module 24 window subscription', () => {
    it('unsubscribes native events and drops pending state reads after disposal', async () => {
        vi.spyOn(core, 'isTauri').mockReturnValue(true);
        const resized: {
            callback?: () => void;
        } = {}, focused: {
            callback?: (event:{payload:boolean}) => void;
        } = {}, unresize = vi.fn(), unfocus = vi.fn();
        const native = { isMaximized: vi.fn().mockResolvedValue(false), isFocused: vi.fn().mockResolvedValue(true), onResized: vi.fn(async (callback: () => void) => { resized.callback = callback; return unresize; }), onFocusChanged: vi.fn(async (callback: (event:{payload:boolean}) => void) => { focused.callback = callback; return unfocus; }) };
        vi.spyOn(windowApi, 'getCurrentWindow').mockReturnValue(native as unknown as ReturnType<typeof windowApi.getCurrentWindow>);
        const read=vi.spyOn(core,'invoke').mockResolvedValue({maximized:false,focused:true});
        const listener = vi.fn(), release = await windowAdapter.subscribe(listener);
        expect(listener).toHaveBeenLastCalledWith({ maximized: false, focused: true });
        read.mockResolvedValue({maximized:true,focused:true});
        resized.callback?.();
        await waitFor(() => expect(listener).toHaveBeenLastCalledWith({ maximized: true, focused: true }));
        // A WebView child-focus notification is only a signal; query the actual window.
        focused.callback?.({payload:false});
        await waitFor(()=>expect(listener).toHaveBeenCalledTimes(3));
        expect(listener).toHaveBeenLastCalledWith({maximized:true,focused:true});
        let resolve!: (value: {maximized:boolean;focused:boolean}) => void;
        read.mockReturnValue(new Promise(done => { resolve = done; }));
        focused.callback?.({payload:false});
        release();
        release();
        resolve({maximized:false,focused:false});
        await Promise.resolve();
        await Promise.resolve();
        expect(listener).toHaveBeenCalledTimes(3);
        expect(unresize).toHaveBeenCalledOnce();
        expect(unfocus).toHaveBeenCalledOnce();
    });
    it('cleans partial native registration when the next listener fails', async () => {
        vi.spyOn(core, 'isTauri').mockReturnValue(true);
        const release = vi.fn();
        const native = { isMaximized: async () => false, isFocused: async () => true, onResized: async () => release, onFocusChanged: async () => { throw Error('Listener failed'); } };
        vi.spyOn(windowApi, 'getCurrentWindow').mockReturnValue(native as unknown as ReturnType<typeof windowApi.getCurrentWindow>);
        await expect(windowAdapter.subscribe(() => { })).rejects.toThrow('Listener failed');
        expect(release).toHaveBeenCalledOnce();
    });
    it('reflects real state, isolates drag from controls and releases listeners', async () => {
        vi.spyOn(windowAdapter, 'enabled').mockReturnValue(true);
        vi.spyOn(windowAdapter, 'isMaximized').mockResolvedValue(false);
        let update: ((state: {
            maximized: boolean;
            focused: boolean;
        }) => void) | undefined;
        const release = vi.fn();
        vi.spyOn(windowAdapter, 'subscribe').mockImplementation(async (callback) => { update = callback; return release; });
        const toggle = vi.spyOn(windowAdapter, 'toggleMaximize').mockResolvedValue(), drag = vi.spyOn(windowAdapter, 'startDragging').mockResolvedValue(), min = vi.spyOn(windowAdapter, 'minimize').mockResolvedValue(), close = vi.spyOn(windowAdapter, 'close').mockResolvedValue(), resize = vi.spyOn(windowAdapter, 'startResizeDragging').mockResolvedValue();
        const { container, unmount } = render(<PrismTitleBar title="Document"/>);
        await waitFor(() => expect(update).toBeDefined());
        act(() => update?.({ maximized: true, focused: false }));
        expect(screen.getByLabelText('Restore window')).toBeEnabled();
        expect(container.querySelector('header')).toHaveAttribute('data-focused', 'false');
        expect(container.querySelector('.window-resize')).toBeNull();
        fireEvent.click(screen.getByLabelText('Restore window'));
        fireEvent.click(screen.getByLabelText('Minimize window'));
        fireEvent.click(screen.getByLabelText('Close window'));
        expect(toggle).toHaveBeenCalledTimes(1);
        expect(min).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
        expect(drag).not.toHaveBeenCalled();
        act(() => update?.({ maximized: false, focused: true }));
        fireEvent.mouseDown(container.querySelector('.window-resize-East')!, { button: 0 });
        expect(resize).toHaveBeenCalledWith('East');
        fireEvent.mouseDown(container.querySelector('.titlebar-drag')!, { button: 0, detail: 1 });
        fireEvent.mouseDown(container.querySelector('.titlebar-drag')!, { button: 0, detail: 2 });
        fireEvent.doubleClick(container.querySelector('.titlebar-drag')!);
        expect(drag).toHaveBeenCalledTimes(1);
        expect(toggle).toHaveBeenCalledTimes(2);
        unmount();
        expect(release).toHaveBeenCalledTimes(1);
    });
    it('cleans an asynchronously registered subscription even after unmount', async () => { const release = vi.fn(); let resolve!: (cleanup: () => void) => void; vi.spyOn(windowAdapter, 'subscribe').mockReturnValue(new Promise(done => { resolve = done; })); const { unmount } = render(<PrismTitleBar title="Delayed"/>); unmount(); await act(async () => resolve(release)); expect(release).toHaveBeenCalledOnce(); });
});
