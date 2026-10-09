import { useUiLanguage as useLocale } from "../../i18n";
import { brandAssets } from '../../design-system/Brand';

export function Prism({ small = false }: { small?: boolean }) {
  useLocale();
  return <img className={small ? 'prism-logo' : 'prism-art'} src={brandAssets.mark} alt="" aria-hidden="true" draggable={false} style={{ objectFit: 'contain' }}/>;
}
