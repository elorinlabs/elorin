import { useUiLanguage as useLocale } from "../i18n";
import { formatIconClass } from '../formats/presentation';
/** All variants come from the user-supplied transparent Elorin artwork. */
export const brandAssets = { mainLogo: '/assets/logo.png', mark: '/assets/brand-mark.png', titlebar: '/assets/brand-mark.png', small: '/assets/brand-mark.png', applicationIcon: 'src-tauri/icons/icon.png', referenceMarkAvailable: true } as const;
export function BrandLogo({ height = 42, className = '' }: { height?: number; className?: string }) {
  useLocale();
    return <img src={brandAssets.mainLogo} height={height} className={`brand-wordmark ${className}`} alt="Elorin" draggable={false} style={{ height, width: 'auto', maxWidth: '100%', objectFit: 'contain' }}/>;
}
export function BrandMark({ size = 24, className = '', label = '' }: {
    size?: number;
    className?: string;
    label?: string;
}) {
  useLocale(); return <img src={brandAssets.mark} width={size} height={size} className={className} alt={label} draggable={false}/>; }
/** Adapter for today's sprites; Module 32 can extend this interface without changing consumers. */
export function FileIcon({ name = '', extension, label, size = 24 }: {
    name?: string;
    extension: string;
    label?: string;
    size?: number;
}) {
  useLocale(); return <span className={formatIconClass(name || `file.${extension}`, extension)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: size, height: size, flexShrink: 0 }}/>; }
