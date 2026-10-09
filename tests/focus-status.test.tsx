import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ContextualStatus } from '../src/viewer/components/ContextualStatus';
import { ViewerShell } from '../src/viewer/components/ViewerShell';
import { uiSettingsStore } from '../src/platform/ui-settings';
import type { ViewerPlugin, ViewerRenderProps } from '../src/viewer/core/types';

const plugin = { id: 'pdf' } as ViewerPlugin;
function props(): ViewerRenderProps {
  return { model: { document: { numPages: 10 } }, context: { source: {} }, session: { metadata: { pdfPage: 3, pdfZoom: 1, pdfEffectiveZoom: 1.5 } } } as unknown as ViewerRenderProps;
}
beforeEach(async () => { history.replaceState(null, '', '/'); await uiSettingsStore.reset(); });
afterEach(() => { vi.useRealTimers(); history.replaceState(null, '', '/'); });
describe('Contextual status presentation', () => {
  it('auto reveals on navigation and the bottom edge, then expires without occupying the shell', () => {
    vi.useFakeTimers(); const state = props();
    const { rerender } = render(<ViewerShell statusFloating content={<p>Reading</p>} statusBar={<ContextualStatus plugin={plugin} props={state}/>} />);
    const bar = screen.getByLabelText('Viewer status');
    expect(bar).toHaveAttribute('data-visible', 'false');
    expect(bar.closest('footer')).toHaveClass('viewer-status-floating');
    state.session.metadata = { ...state.session.metadata, pdfPage: 4 };
    rerender(<ViewerShell statusFloating content={<p>Reading</p>} statusBar={<ContextualStatus plugin={plugin} props={state}/>} />);
    expect(bar).toHaveTextContent('Page 4 / 10'); expect(bar).toHaveTextContent('Zoom 150%');
    expect(bar).toHaveAttribute('data-visible', 'true');
    act(() => vi.advanceTimersByTime(2600)); expect(bar).toHaveAttribute('data-visible', 'false');
    fireEvent(window, new MouseEvent('pointermove', { clientY: innerHeight - 2 }));
    expect(bar).toHaveAttribute('data-visible', 'true');
    fireEvent(window, new MouseEvent('pointermove', { clientY: 100 }));
    expect(bar).toHaveAttribute('data-visible', 'false');
  });
  it('show is persistent in the normal viewer but Focus remains transient', async () => {
    await uiSettingsStore.update({ statusBar: 'show' }); vi.useFakeTimers();
    const { unmount } = render(<ContextualStatus plugin={plugin} props={props()}/>);
    act(() => vi.advanceTimersByTime(10000)); expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'true');
    unmount(); history.replaceState(null, '', '/?window=focus');
    render(<ContextualStatus plugin={plugin} props={props()}/>);
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'false');
    fireEvent.keyDown(window, { key: 'F6', shiftKey: true });
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'true');
  });
  it('hide suppresses metadata while preserving actual errors and running tasks', async () => {
    await uiSettingsStore.update({ statusBar: 'hide' });
    const state = props(); const { rerender } = render(<ContextualStatus plugin={plugin} props={state}/>);
    expect(screen.queryByLabelText('Viewer status')).toBeNull();
    state.model = { document: { numPages: 10 }, error: 'PDF data could not be read.' };
    rerender(<ContextualStatus plugin={plugin} props={state}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('PDF data could not be read.');
    expect(screen.queryByText(/Page 3/)).toBeNull();
    state.model = { busy: true, progress: 'Indexing 12 of 40 pages' };
    rerender(<ContextualStatus plugin={plugin} props={state}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Indexing 12 of 40 pages');
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'true');
  });
  it('does not carry transient status into another file and cleans up its timeout', () => {
    vi.useFakeTimers(); const first = props(); const { rerender, unmount } = render(<ContextualStatus plugin={plugin} props={first}/>);
    first.session.metadata = { pdfPage: 7 };
    rerender(<ContextualStatus plugin={plugin} props={first}/>);
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'true');
    rerender(<ContextualStatus plugin={plugin} props={props()}/>);
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'false');
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('resets bottom-edge visibility when the source changes', () => {
    const { rerender } = render(<ContextualStatus plugin={plugin} props={props()}/>);
    fireEvent(window, new MouseEvent('pointermove', { clientY: innerHeight - 2 }));
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'true');
    rerender(<ContextualStatus plugin={plugin} props={props()}/>);
    expect(screen.getByLabelText('Viewer status')).toHaveAttribute('data-visible', 'false');
  });
});
