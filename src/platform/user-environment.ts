import { invoke, isTauri } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
export interface UserEnvironment {
  timeZone: string | null;
  utcOffsetMinutes: number;
  region: string | null;
  locale: string;
  defaultLanguage: string;
  preferredLanguages: string[];
  windowsTimeZone: string | null;
  source: 'system' | 'browser';
}
interface NativeEnvironment { locale?: string; preferredLanguages?: string[]; region?: string; windowsTimeZone?: string }
export function canonicalLocale(value: string): string | undefined { try { return Intl.getCanonicalLocales(value.replace(/_/g, '-'))[0]; } catch { return undefined; } }
export function browserEnvironment(): UserEnvironment {
  const options = Intl.DateTimeFormat().resolvedOptions();
  const preferredLanguages = [...new Set((typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language]).filter(Boolean).map(canonicalLocale).filter((v): v is string => !!v))];
  const locale = canonicalLocale(options.locale) ?? preferredLanguages[0] ?? 'en';
  let region: string | null = null; try { region = new Intl.Locale(locale).region ?? null; } catch { /* Unknown region remains unknown. */ }
  return { timeZone: options.timeZone || null, utcOffsetMinutes: -new Date().getTimezoneOffset(), region, locale, defaultLanguage: preferredLanguages[0] ?? locale, preferredLanguages: preferredLanguages.length ? preferredLanguages : [locale], windowsTimeZone: null, source: 'browser' };
}
export function mergeEnvironment(browser: UserEnvironment, native?: NativeEnvironment): UserEnvironment {
  if (!native) return browser;
  const preferredLanguages = (native.preferredLanguages ?? []).map(canonicalLocale).filter((v): v is string => !!v);
  const locale = native.locale && canonicalLocale(native.locale) || browser.locale;
  return { ...browser, locale, region: native.region || browser.region, preferredLanguages: preferredLanguages.length ? preferredLanguages : native.locale ? [locale] : browser.preferredLanguages, defaultLanguage: preferredLanguages[0] ?? (native.locale ? locale : browser.defaultLanguage), windowsTimeZone: native.windowsTimeZone ?? null, source: 'system' };
}
let profile = browserEnvironment(), pending: Promise<UserEnvironment> | undefined;
const subscribers = new Set<() => void>();
export async function getUserEnvironment(refresh = false): Promise<UserEnvironment> {
  if (!refresh && pending) { const value = await pending; return {...value, preferredLanguages:[...value.preferredLanguages]}; }
  const operation = (async () => { const browser = browserEnvironment(); let native: NativeEnvironment | undefined; if (isTauri()) try { native = await invoke<NativeEnvironment>('user_environment'); } catch { /* Embedded/browser fallback is explicit in source. */ } profile = mergeEnvironment(browser, native); subscribers.forEach(fn => fn()); return profile; })();
  pending = operation; const value = await operation; return {...value, preferredLanguages:[...value.preferredLanguages]};
}
export const userEnvironment = { get: getUserEnvironment, snapshot: () => profile, subscribe(callback: () => void) { subscribers.add(callback); return () => { subscribers.delete(callback); }; } };
export function useUserEnvironment() { return useSyncExternalStore(userEnvironment.subscribe, userEnvironment.snapshot); }
