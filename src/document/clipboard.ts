import { isTauri } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
export const readClipboard = () => isTauri() ? readText() : navigator.clipboard.readText();
export const writeClipboard = (text: string) => isTauri() ? writeText(text) : navigator.clipboard.writeText(text);
