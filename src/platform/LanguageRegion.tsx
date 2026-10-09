import { supportedLanguages, languageNames, setUiLanguage, t, useUiLanguage } from '../i18n';
import { useUserEnvironment } from './user-environment';
import { uiSettingsStore, useUiSettings } from './ui-settings';
export function LanguageRegion({ onError }: { onError: (message:string)=>void }) {
  const language = useUiLanguage(); const profile = useUserEnvironment(), settings = useUiSettings();
  return <><label className="setting-row"><span>{t('Display language')}<small>{t('Follow the system language or choose a language for Elorin.')}</small></span><select aria-label={t('Display language')} value={settings.language} onChange={e=>{const value=e.target.value as typeof supportedLanguages[number]|'system';void uiSettingsStore.update({language:value,languagePreferenceVersion:1}).then(()=>setUiLanguage(value),error=>onError(String(error)));}}><option value="system">{t('Follow system')}</option>{supportedLanguages.map(code=><option key={code} value={code} lang={code}>{languageNames[code]}</option>)}</select></label>
  <div className="settings-note"><p>{t('System language')}: {profile.defaultLanguage}</p><p>{t('Region')}: {profile.region ? new Intl.DisplayNames([language],{type:'region'}).of(profile.region) ?? profile.region : t('Unknown')}</p><p>{t('Time zone')}: {profile.timeZone ?? t('Unknown')}</p><p>{t('Regional format')}: {profile.locale}</p><p>{t('These values come from your device settings. No location lookup is performed.')}</p></div></>;
}
