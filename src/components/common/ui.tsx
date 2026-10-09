import { useAnchoredPosition } from './layer-layout';
import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { forwardRef, useCallback, useId, useState, useLayoutEffect, useEffect, useRef, isValidElement, cloneElement, type ReactElement, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, } from "react";
import { createPortal } from 'react-dom';
import { Search } from "lucide-react";
export function Button({ className = "", variant = "secondary", loading = false, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    variant?: "primary" | "secondary" | "tertiary" | "danger";
}) {
  useLocale();
    return (<button type="button" className={`button ${variant} ${className}`} {...props} disabled={disabled || loading} aria-busy={loading || undefined}/>);
}
export function IconButton({ className = "", loading = false, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
}) {
  useLocale();
    return (<button type="button" className={`icon-button ${className}`} {...props} disabled={disabled || loading} aria-busy={loading || undefined}/>);
}
export function Surface({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  useLocale();
    return <div className={`surface ${className}`} {...props}/>;
}
export function Tooltip({ label, children, }: {
    label: string;
    children: ReactNode;
}) {
  useLocale();
    const id = useId(), [open, setOpen] = useState(false), anchor = useRef<HTMLSpanElement>(null), tip = useRef<HTMLSpanElement>(null), [position, setPosition] = useState({ left: 0, top: 0 });
    const dismiss = useCallback(() => setOpen(false), []);
    useAnchoredPosition(open,anchor,tip,setPosition,dismiss);
    return <span ref={anchor} className="tooltip-host" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={e => { if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
    } }}>
    {isValidElement(children) ? cloneElement(children as ReactElement<{
        'aria-describedby'?: string;
    }>, { 'aria-describedby': open ? id : undefined }) : children}
    {open && createPortal(<span ref={tip} id={id} className="tooltip" role="tooltip" style={{ position: 'fixed', right: 'auto', zIndex: anchor.current?.closest('[aria-modal="true"]') ? 'calc(var(--z-modal) + 1)' : 'var(--z-tooltip)', ...position }}>{label}</span>, document.body)}
  </span>;
}
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SearchInput(props, ref) {
    return (<label className="search">
      <Search size={19}/>
      <input ref={ref} aria-label={tr("Global search")} placeholder={tr("Search files, content, or ask Elorin...")} {...props}/>
      <kbd>{navigator.platform.includes("Mac") ? "⌘" : tr("Ctrl")} K</kbd>
    </label>);
});
export function FileTypeBadge({ extension }: {
    extension: string;
}) {
  useLocale();
    return (<span className={`file-badge ext-${extension.toLowerCase()}`}>
      {extension.toUpperCase()}
    </span>);
}
export { Input, Select, Checkbox, Radio, Switch, Tabs, SegmentedControl, Badge, Separator, Progress, Skeleton, Card, Panel, EmptyState, ScrollArea, Dropdown } from "./controls";
