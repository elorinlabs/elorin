import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
/** Event-driven; no idle poller. Hidden tabs and minimized windows suspend reads/search. */
export function useBinaryActivity(active = true) {
  const [visible, setVisible] = useState(!document.hidden);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    let closed = false; const cleanups: (() => void)[] = [];
    if (isTauri()) void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const check = async () => { const value = await win.isMinimized(); if (!closed) setMinimized(value); };
      const add = (fn: () => void) => { if (closed) fn(); else cleanups.push(fn); };
      await check(); add(await win.onResized(() => { void check(); })); add(await win.onFocusChanged(() => { void check(); }));
    }).catch(() => { /* Browser visibility still provides the suspension boundary. */ });
    return () => { closed = true; document.removeEventListener('visibilitychange', update); cleanups.forEach(fn => fn()); };
  }, []);
  return active && visible && !minimized;
}
