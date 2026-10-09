import { useSyncExternalStore } from 'react';
import { getUserEnvironment, userEnvironment } from '../platform/user-environment';
import { platformIntegration } from '../platform/integration';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import it from './locales/it.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
export const supportedLanguages = ['en','zh','ja','ko','it','fr','pt'] as const;
export type UiLanguage = typeof supportedLanguages[number];
export type LanguagePreference = UiLanguage | 'system';
export const languageNames: Record<UiLanguage,string> = { en:'English', zh:'简体中文', ja:'日本語', ko:'한국어', it:'Italiano', fr:'Français', pt:'Português' };
export const catalogs: Record<UiLanguage,Record<string,string>> = { en,zh,ja,ko,it,fr,pt };
const event = 'elorin-ui-language';
let preference: LanguagePreference = 'system';
try { const saved = localStorage.getItem('elorin-ui-language'); if (saved && (supportedLanguages as readonly string[]).includes(saved)) preference = saved as UiLanguage; } catch { /* Memory fallback. */ }
export function resolveLanguage(languages: readonly string[]): UiLanguage {
  for (const tag of languages) { const primary = tag.toLowerCase().split(/[-_]/)[0]; if ((supportedLanguages as readonly string[]).includes(primary)) return primary as UiLanguage; }
  return 'en';
}
let language = preference === 'system' ? resolveLanguage(userEnvironment.snapshot().preferredLanguages) : preference;
export function uiLanguage(): UiLanguage { return language; }
export function languagePreference(): LanguagePreference { return preference; }
function apply() { const next = preference === 'system' ? resolveLanguage(userEnvironment.snapshot().preferredLanguages) : preference; const changed = next !== language; language = next; if (typeof document !== 'undefined') document.documentElement.lang = language === 'zh' ? 'zh-CN' : language; if (changed && typeof window !== 'undefined') window.dispatchEvent(new Event(event)); }
export function setUiLanguage(value: LanguagePreference, persist = true) { if (value !== 'system' && !(supportedLanguages as readonly string[]).includes(value)) return; preference = value; if (persist) try { localStorage.setItem('elorin-ui-language',value); } catch { /* Memory fallback. */ } apply(); }
const subscribe = (notify: () => void) => { const storage = (e: StorageEvent) => { if (e.key === 'elorin-ui-language' && e.newValue) setUiLanguage(e.newValue as LanguagePreference,false); }; window.addEventListener(event,notify); window.addEventListener('storage',storage); return () => { window.removeEventListener(event,notify); window.removeEventListener('storage',storage); }; };
export function useUiLanguage() { return useSyncExternalStore(subscribe,uiLanguage,()=>'en' as UiLanguage); }
const templates = Object.keys(zh).filter(key=>/\{\w+\}/.test(key) && /[A-Za-z\u4e00-\u9fff]{2}/.test(key.replace(/\{\w+\}/g,""))).sort((a,b)=>b.replace(/\{\w+\}/g,"").length-a.replace(/\{\w+\}/g,"").length).map(key=>{ const names:string[]=[]; const pattern=key.split(/(\{\w+\})/g).map(part=>{if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '(.*?)';}return part.replace(/[.*+?^$\{}()|[\]\\]/g,'\\$&');}).join('');return {key,names,match:new RegExp('^'+pattern+'$','s')}; });
export function t(key: string, variables?: Record<string,unknown>, locale: UiLanguage = language): string {
  let value = catalogs[locale][key];
  if(value === undefined && locale !== 'en' && key.length < 4096)for(const template of templates){const found=key.match(template.match);if(found){value=catalogs[locale][template.key];variables=Object.fromEntries(template.names.map((name,i)=>[name,found[i+1]]));break;}}
  value ??= key;
  return variables ? value.replace(/\{(\w+)\}/g,(match,name)=>Object.prototype.hasOwnProperty.call(variables,name) ? String(variables[name] ?? '') : match) : value;
}
export function localizedError(error: unknown): string { if (error instanceof Error) return t(error.message); if (error && typeof error === 'object' && 'message' in error) return t(String(error.message)); return t(String(error)); }
export function formatNumber(value: number|bigint) { return new Intl.NumberFormat(userEnvironment.snapshot().locale).format(value); }
export function formatDate(value: Date|number, options?: Intl.DateTimeFormatOptions) { const profile = userEnvironment.snapshot(); return new Intl.DateTimeFormat(profile.locale,{...options,timeZone:profile.timeZone??undefined}).format(value); }
let initialized: Promise<void> | undefined;
export function initializeLocalization() { return initialized ??= (async () => { await getUserEnvironment(); try { const data = await platformIntegration.read<{ui?:{language?:string;languagePreferenceVersion?:number}}>('settings'); const stored = data?.ui?.language; if (stored && (stored !== 'en' || data?.ui?.languagePreferenceVersion === 1) && (stored === 'system' || (supportedLanguages as readonly string[]).includes(stored))) preference = stored as LanguagePreference; } catch { /* Existing local preference remains. */ } apply(); userEnvironment.subscribe(apply); window.addEventListener('languagechange',()=>{void getUserEnvironment(true);}); window.addEventListener('focus',()=>{void getUserEnvironment(true);}); })(); }


