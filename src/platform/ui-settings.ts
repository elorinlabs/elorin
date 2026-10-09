import { useSyncExternalStore } from 'react';
import { platformIntegration } from './integration';
import { setUiLanguage, type LanguagePreference } from '../i18n';
export const defaultUiSettings = {
  accent: '#0066ff', density: 'comfortable', uiScale: 100, reduceMotion: false, highContrast: false,
  largeTargets: false, scrollbar: 'auto', statusBar: 'auto', inspector: true, rememberWorkspace: true,
  textWrap: true, textNumbers: true, textTabSize: 4, textFontSize: 14, textLineHeight: 1.5,
  focusAutoHide: true, focusBackground: 'solid', focusBackgroundColor: '#eef6ff', focusExitOnFileClose: false,
  showTips: true, searchCase: false, searchWhole: false, language: 'system', languagePreferenceVersion: 1,
};
export type UiSettings = typeof defaultUiSettings;
let snapshot: UiSettings = { ...defaultUiSettings }, loaded: Promise<void> | undefined, updates: Promise<unknown> = Promise.resolve();
const subscribers=new Set<()=>void>();
export function validateUiSettings(value:unknown):UiSettings {
 const result={...defaultUiSettings};
 if(!value||typeof value!=='object')return result;
 const input=value as Record<string,unknown>;
 for(const key of Object.keys(result) as (keyof UiSettings)[]) {
  const v=input[key];if(typeof v!==typeof result[key])continue;
  if(typeof v==='number'&&!Number.isFinite(v))continue;
  (result as Record<string,unknown>)[key]=v;
 }
 if(!/^#[0-9a-f]{6}$/i.test(result.accent))result.accent=defaultUiSettings.accent;
 if(!/^#[0-9a-f]{6}$/i.test(result.focusBackgroundColor))result.focusBackgroundColor=defaultUiSettings.focusBackgroundColor;
 const enumKeys={density:['comfortable','compact','touch'],scrollbar:['auto','always'],statusBar:['auto','show','hide'],focusBackground:['solid','gradient','blur'],language:['system','en','zh','ja','ko','it','fr','pt']} as const;
 for(const key of Object.keys(enumKeys) as (keyof typeof enumKeys)[])if(!(enumKeys[key] as readonly string[]).includes(result[key]))result[key]=defaultUiSettings[key];
 result.uiScale=Math.max(80,Math.min(150,result.uiScale));
 result.textFontSize=Math.max(12,Math.min(24,result.textFontSize));
 result.textLineHeight=Math.max(1.2,Math.min(2,result.textLineHeight));
 if(![2,4,8].includes(result.textTabSize))result.textTabSize=4;
 return result;
}
function apply(){setUiLanguage(snapshot.language as LanguagePreference,false);const root=document.documentElement;root.dataset.density=snapshot.density;root.dataset.reduceMotion=String(snapshot.reduceMotion);root.dataset.highContrast=String(snapshot.highContrast);root.dataset.largeTargets=String(snapshot.largeTargets);root.dataset.scrollbar=snapshot.scrollbar;root.style.setProperty('--ui-scale',String(snapshot.uiScale/100));root.style.setProperty('--ui-accent',snapshot.accent);root.style.setProperty('--ui-code-font-size',snapshot.textFontSize+'px');root.style.setProperty('--ui-code-line-height',String(snapshot.textLineHeight));}
function notify(){apply();subscribers.forEach(fn=>fn());window.dispatchEvent(new Event('elorin-ui-settings'));}
export const uiSettingsStore={
 snapshot:()=>snapshot,
 subscribe(fn:()=>void){subscribers.add(fn);return()=>{subscribers.delete(fn);};},
 load(){return loaded??=(async()=>{const data=await platformIntegration.read<Record<string,unknown>>('settings');snapshot=validateUiSettings(data?.ui);const legacy=data?.ui as Record<string,unknown>|undefined;if(!legacy?.language || (legacy.language === 'en' && legacy.languagePreferenceVersion !== 1)){let saved: string|null=null;try{saved=localStorage.getItem('elorin-ui-language');}catch{/* Storage can be unavailable. */}snapshot.language=saved&&['system','en','zh','ja','ko','it','fr','pt'].includes(saved)?saved:'system';}notify();})();},
 update(patch:Partial<UiSettings>){const pending=updates.catch(()=>{}).then(async()=>{await this.load();const next=validateUiSettings({...snapshot,...patch});await platformIntegration.updateSettings(current=>({...current,ui:next}));snapshot=next;notify();});updates=pending;return pending;},
 async reset(){await this.update({...defaultUiSettings});},
};
export function useUiSettings(){return useSyncExternalStore(uiSettingsStore.subscribe,uiSettingsStore.snapshot);}
