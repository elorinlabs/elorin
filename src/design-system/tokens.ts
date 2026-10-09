import { typography } from "./typography";
/** Semantic source of truth; legacy aliases let existing Viewers migrate without rewriting them. */
export const semanticColors = {
    light: { 'app-background': '#F8FAFC', 'surface-primary': '#FFFFFF', 'surface-secondary': '#F0F7FF', 'surface-raised': '#FFFFFF', 'surface-hover': '#EAF3FF', 'surface-active': '#DCEBFF', 'accent-primary': '#0B66F5', 'accent-hover': '#0754CF', 'accent-subtle': '#E5F0FF', 'text-primary': '#0B1538', 'text-secondary': '#52658A', 'text-muted': '#58698C', 'border-default': '#DCE6F3', 'border-subtle': '#EAF0F8', 'focus-ring': '#0B66F5', success: '#087A59', warning: '#926000', danger: '#C32C40', 'on-accent': '#FFFFFF', 'shadow-color': '#24487A14' },
    dark: { 'app-background': '#101827', 'surface-primary': '#172235', 'surface-secondary': '#1D2B42', 'surface-raised': '#22324A', 'surface-hover': '#293D59', 'surface-active': '#284972', 'accent-primary': '#8CBDFF', 'accent-hover': '#B1D3FF', 'accent-subtle': '#233F65', 'text-primary': '#F0F5FF', 'text-secondary': '#BDCBE2', 'text-muted': '#ABBBD4', 'border-default': '#405470', 'border-subtle': '#2B3D57', 'focus-ring': '#8CBDFF', success: '#6DD9B1', warning: '#F6CE78', danger: '#FF9AA8', 'on-accent': '#101827', 'shadow-color': '#00000040' }
} as const;
const aliases = { background: 'app-background', surface: 'surface-primary', surfaceElevated: 'surface-secondary', border: 'border-default', textPrimary: 'text-primary', textSecondary: 'text-secondary', textMuted: 'text-muted', accent: 'accent-primary', accentStrong: 'accent-hover', accentSurface: 'accent-subtle', shadowColor: 'shadow-color', glass: 'surface-secondary' } as const;
function palette(mode: 'light' | 'dark'): Record<string, string> { const values = semanticColors[mode]; return { ...values, ...Object.fromEntries(Object.entries(aliases).map(([key, value]) => [key, values[value]])), code: values.success, data: values.warning, media: values['accent-primary'], archive: values['text-secondary'], transparent: 'transparent' }; }
export const colors = { light: palette('light'), dark: palette('dark') };
export const tokens = { colors, typography, spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }, space: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64], radius: { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999, small: 6, medium: 8, large: 12, window: 16 }, shadow: { soft: '0 8px 28px var(--shadow-color)', raised: '0 4px 16px var(--shadow-color)' }, border: { thin: '1px solid var(--border-default)' }, motion: { fast: '120ms', panel: '180ms' }, layers: { content: 0, sticky: 10, toolbar: 20, scrollbar: 21, panel: 30, dropdown: 50, popover: 50, tooltip: 55, modal: 60, notification: 80, 'window-overlay': 90 } };
export function applyTokens(mode: 'light' | 'dark' = 'light') {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(colors[mode]))
        root.style.setProperty('--' + key, value);
    for (const [key, value] of Object.entries(tokens.spacing))
        root.style.setProperty('--space-' + key, value + 'px');
    for (const value of tokens.space)
        root.style.setProperty('--space-' + value, value + 'px');
    for (const [key, value] of Object.entries(tokens.radius))
        root.style.setProperty('--radius-' + key, value + 'px');
    for (const [key, value] of Object.entries(typography.roles)) {
        root.style.setProperty('--type-' + key + '-size', value.size + 'px');
        root.style.setProperty('--type-' + key + '-line', value.line + 'px');
        root.style.setProperty('--type-' + key + '-weight', String(value.weight));
    }
    for (const [key, value] of Object.entries(tokens.layers))
        root.style.setProperty('--z-' + key, String(value));
    const layers = { base: 'content', viewer: 'content', floating: 'popover', titlebar: 'window-overlay', menu: 'dropdown', modal: 'modal', resize: 'window-overlay' };
    for (const [key, value] of Object.entries(layers))
        root.style.setProperty('--layer-' + key, 'var(--z-' + value + ')');
    root.style.setProperty('--font-body', typography.body);
    root.style.setProperty('--font-display', typography.display);
    root.style.setProperty('--font-code', typography.code);
    root.style.setProperty('--motion', tokens.motion.fast);
    root.style.setProperty('--shadow', tokens.shadow.soft);
}
