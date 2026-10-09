import { useUiLanguage as useLocale, localizedError as uiError } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { windowAdapter } from "../../services/windowAdapter";
import { BrandMark } from '../../design-system/Brand';
import { chromeLabels, useUiLanguage } from '../../design-system/locale';
export function PrismTitleBar({ title }: {
    title: string;
}) {
  useLocale();
    const [maximized, setMaximized] = useState(false);
    const [focused, setFocused] = useState(true);
    const [error, setError] = useState('');
    const mounted = useRef(true);
    const labels = chromeLabels[useUiLanguage()];
    const perform = (action: () => Promise<void>) => { void action().catch(error => { if (mounted.current)
        setError(uiError(error)); }); };
    useEffect(() => {
        mounted.current = true;
        let closed = false, release: (() => void) | undefined;
        const sync = () => {
            void windowAdapter.isMaximized().then(value => { if (!closed)
                setMaximized(value); }).catch(error => { if (!closed)
                setError(uiError(error)); });
        };
        sync();
        void windowAdapter.subscribe(state => { if (!closed) {
            setMaximized(state.maximized);
            setFocused(state.focused);
        } }).then(cleanup => { if (closed)
            cleanup();
        else
            release = cleanup; }).catch(error => { if (!closed)
            setError(uiError(error)); });
        window.addEventListener("resize", sync);
        const systemMenu = (event: KeyboardEvent) => { if (windowAdapter.enabled() && event.altKey && event.code === 'Space') {
            event.preventDefault();
            perform(() => windowAdapter.systemMenu());
        } };
        window.addEventListener('keydown', systemMenu);
        return () => { closed = true; mounted.current = false; release?.(); window.removeEventListener("resize", sync); window.removeEventListener('keydown', systemMenu); };
    }, []);
    return (<header className="prism-titlebar" aria-label={labels.window} data-focused={focused} data-maximized={maximized}>
      {windowAdapter.enabled() &&
            !maximized &&
            ([
                "East",
                "North",
                "NorthEast",
                "NorthWest",
                "South",
                "SouthEast",
                "SouthWest",
                "West",
            ] as const).map((direction) => (<div key={direction} aria-hidden="true" className={`window-resize window-resize-${direction}`} onMouseDown={(event) => {
                    if (event.button !== 0)
                        return;
                    event.preventDefault();
                    event.stopPropagation();
                    perform(() => windowAdapter.startResizeDragging(direction));
                }}/>))}
      <div className="titlebar-drag" data-drag-region="titlebar-only" onContextMenu={event => { if (windowAdapter.enabled()) {
        event.preventDefault();
        event.stopPropagation();
        perform(() => windowAdapter.systemMenu());
    } }} onMouseDown={(e) => {
            if (e.button !== 0)
                return;
            if ((e.target as Element).closest('button,input,select,textarea,a,[role=tab],[data-no-drag]'))
                return;
            e.preventDefault();
            if (e.detail === 2)
                perform(() => windowAdapter.toggleMaximize());
            else perform(() => windowAdapter.startDragging());
        }} onDoubleClick={event => { if (!windowAdapter.enabled() && !(event.target as Element).closest('button,input,select,textarea,a,[role=tab],[data-no-drag]'))
        perform(() => windowAdapter.toggleMaximize()); }}>
        <BrandMark size={19}/>
        <span>Elorin</span>
        <span className="titlebar-context">{title}</span>
      </div>
      {error && <span className="titlebar-context" role="alert">{error}</span>}
      <div className="window-controls" data-no-drag="true">
        <button disabled={!windowAdapter.enabled()} aria-label={labels.minimize} onClick={() => perform(() => windowAdapter.minimize())}>
          <Minus size={14}/>
        </button>
        <button disabled={!windowAdapter.enabled()} aria-label={maximized ? labels.restore : labels.maximize} onClick={() => perform(() => windowAdapter.toggleMaximize())}>
          {maximized ? <Copy size={12}/> : <Square size={12}/>}
        </button>
        <button disabled={!windowAdapter.enabled()} className="window-close" aria-label={labels.close} onClick={() => perform(() => windowAdapter.close())}>
          <X size={15}/>
        </button>
      </div>
    </header>);
}
