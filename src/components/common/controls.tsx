import { useAnchoredPosition } from './layer-layout';
import { useUiLanguage as useLocale } from "../../i18n";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type HTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
    invalid?: boolean;
}>(function Input({ invalid, className = '', ...props }, ref) { return <input {...props} ref={ref} aria-invalid={invalid || undefined} className={`ds-input ${className}`}/>; });
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & {
    invalid?: boolean;
}>(function Select({ invalid, className = '', ...props }, ref) { return <select {...props} ref={ref} aria-invalid={invalid || undefined} className={`ds-select ${className}`}/>; });
function Choice({ kind, children, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & {
    kind: 'checkbox' | 'radio';
    children?: ReactNode;
}) {
  useLocale(); return <label className={`ds-choice ${className}`}><input {...props} type={kind}/><span>{children}</span></label>; }
export function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  useLocale(); return <Choice {...props} kind="checkbox"/>; }
export function Radio(props: InputHTMLAttributes<HTMLInputElement>) {
  useLocale(); return <Choice {...props} kind="radio"/>; }
export function Switch({ checked, onCheckedChange, disabled, children }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
    disabled?: boolean;
    children: ReactNode;
}) {
  useLocale(); return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)} className="ds-switch"><span className="ds-switch-track" aria-hidden="true"><span /></span>{children}</button>; }
export interface TabOption {
    id: string;
    label: ReactNode;
    disabled?: boolean;
}
export function Tabs({ options, value, onChange, label, segmented = false }: {
    options: TabOption[];
    value: string;
    onChange: (id: string) => void;
    label: string;
    segmented?: boolean;
}) {
  useLocale();
    const root = useRef<HTMLDivElement>(null);
    const enabled = options.filter(o => !o.disabled), selected = enabled.some(o => o.id === value) ? value : enabled[0]?.id;
    return <div ref={root} role="tablist" aria-label={label} className={segmented ? 'ds-segmented' : 'ds-tabs'} onKeyDown={e => { let index = enabled.findIndex(o => o.id === selected); if (e.key === 'ArrowRight')
        index = (index + 1) % enabled.length;
    else if (e.key === 'ArrowLeft')
        index = (index - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home')
        index = 0;
    else if (e.key === 'End')
        index = enabled.length - 1;
    else
        return; if (!enabled.length)
        return; e.preventDefault(); const next = enabled[index]; onChange(next.id); root.current?.querySelector<HTMLButtonElement>(`[data-tab-index="${options.indexOf(next)}"]`)?.focus(); }}>
  {options.map((o, index) => <button type="button" role="tab" key={o.id} data-tab-index={index} disabled={o.disabled} aria-selected={o.id === selected} tabIndex={o.id === selected ? 0 : -1} onClick={() => onChange(o.id)}>{o.label}</button>)}
 </div>;
}
export function SegmentedControl(props: Omit<Parameters<typeof Tabs>[0], 'segmented'>) {
  useLocale(); return <Tabs {...props} segmented/>; }
export function Badge({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & {
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  useLocale(); return <span {...props} className={`ds-badge ds-${tone} ${className}`}/>; }
export function Separator() {
  useLocale(); return <hr className="ds-separator"/>; }
export function Progress({ value, label }: {
    value?: number;
    label: string;
}) {
  useLocale(); return <progress className="ds-progress" aria-label={label} max={100} value={value === undefined ? undefined : Math.max(0, Math.min(100, value))}/>; }
export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useLocale(); return <div {...props} aria-hidden="true" className={`ds-skeleton ${className}`}/>; }
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useLocale(); return <div {...props} className={`surface ds-card ${className}`}/>; }
export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  useLocale(); return <section {...props} className={`ds-panel ${className}`}/>; }
export function EmptyState({ title, description, action }: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
}) {
  useLocale(); return <div className="ds-empty"><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>; }
export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
    variant?: 'minimal' | 'reading' | 'data';
}>(function ScrollArea({ variant = 'minimal', className = '', tabIndex = 0, ...props }, ref) { return <div {...props} ref={ref} tabIndex={tabIndex} data-scroll={variant} className={`ds-scroll ${className}`}/>; });
export interface DropdownItem {
    id: string;
    label: ReactNode;
    disabled?: boolean;
    onSelect: () => void;
}
export function Dropdown({ label, items, disabled }: {
    label: string;
    items: DropdownItem[];
    disabled?: boolean;
}) {
  useLocale();
    const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 }), button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId();
    const dismiss = useCallback(() => setOpen(false), []);
    const close = (restore = false) => { setOpen(false); if (restore) button.current?.focus(); };
    useAnchoredPosition(open, button, menu, setPosition, dismiss);
    useLayoutEffect(() => { if(open) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [open]);
    useEffect(() => { if (!open) return; const outside = (e:PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) dismiss(); }; document.addEventListener('pointerdown',outside); return()=>document.removeEventListener('pointerdown',outside); },[open,dismiss]);
    return <><button type="button" className="button secondary" ref={button} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => setOpen(v => !v)} onKeyDown={e => { if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
    } }}>
  {label}</button>{open && createPortal(<div id={id} ref={menu} role="menu" aria-label={label} className="ds-dropdown" style={position} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget))
        close(); }} onKeyDown={e => { if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
    } const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); let index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (e.key === 'ArrowDown')
        index = (index + 1) % buttons.length;
    else if (e.key === 'ArrowUp')
        index = (index - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home')
        index = 0;
    else if (e.key === 'End')
        index = buttons.length - 1;
    else
        return; e.preventDefault(); buttons[index]?.focus(); }}>{items.map(item => <button role="menuitem" type="button" disabled={item.disabled} key={item.id} onClick={() => { close(true); item.onSelect(); }}>{item.label}</button>)}</div>, document.body)}</>;
}
