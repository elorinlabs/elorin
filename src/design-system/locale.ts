import { t, supportedLanguages } from '../i18n';
export { uiLanguage, setUiLanguage, useUiLanguage, type UiLanguage } from '../i18n';
export const chromeLabels = Object.fromEntries(supportedLanguages.map(language => [language, {
 minimize: t('Minimize window',undefined,language), maximize:t('Maximize window',undefined,language),
 restore:t('Restore window',undefined,language), close:t('Close window',undefined,language), window:t('Elorin window',undefined,language)
}])) as Record<typeof supportedLanguages[number],{minimize:string;maximize:string;restore:string;close:string;window:string}>;
