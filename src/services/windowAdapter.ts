import { isTauri, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
/** Platform boundary: browser preview shares the surface without controlling a window. */
export const windowAdapter = {
    enabled: () => isTauri(),
    async minimize() {
        if (isTauri())
            await getCurrentWindow().minimize();
    },
    async toggleMaximize() {
        if (isTauri())
            await getCurrentWindow().toggleMaximize();
    },
    async close() {
        if (isTauri())
            await getCurrentWindow().close();
    },
    async systemMenu() {
        if (isTauri())
            await invoke('window_system_menu');
    },
    async startDragging() {
        if (isTauri())
            await getCurrentWindow().startDragging();
    },
    async startResizeDragging(direction: "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West") {
        if (isTauri())
            await getCurrentWindow().startResizeDragging(direction);
    },
    async isMaximized() {
        return isTauri() && (await getCurrentWindow().isMaximized());
    },
    async subscribe(listener: (state: {
        maximized: boolean;
        focused: boolean;
    }) => void) {
        if (!isTauri())
            return () => { };
        const win = getCurrentWindow();
        let closed = false, revision = 0;
        const cleanups: (() => void)[] = [];
        const sync = async () => { const generation = ++revision; const state=await invoke<{maximized:boolean;focused:boolean}>('window_chrome_state'); if (!closed && generation === revision)
            listener(state); };
        try {
            cleanups.push(await win.onResized(() => { void sync().catch(console.error); }));
            cleanups.push(await win.onFocusChanged(() => { void sync().catch(console.error); }));
            // WebView keyboard focus can change independently of the outer HWND's activation.
            const domFocus=()=>{void sync().catch(console.error);};
            window.addEventListener('focus',domFocus);
            window.addEventListener('blur',domFocus);
            cleanups.push(()=>{window.removeEventListener('focus',domFocus);window.removeEventListener('blur',domFocus);});
            // Register first, then snapshot: activation during registration must not be lost.
            await sync();
        }
        catch (error) {
            cleanups.forEach(fn => fn());
            throw error;
        }
        return () => { if (closed)
            return; closed = true; revision++; cleanups.splice(0).forEach(fn => fn()); };
    },
};
