import { invoke, isTauri } from "@tauri-apps/api/core";
import { FileLoadError, type FileDescriptor } from "../types/files";
import { detectBrowserFile } from "./detection/browserDetector";
import { enhanceDescriptor } from '../formats';
export interface FileLoader {
  loadPath(path: string): Promise<FileDescriptor>;
  loadBrowserFile(file: File): Promise<FileDescriptor>;
}
export class TauriFileAdapter {
  private async describe(file:FileDescriptor,fallbackPath?:string){
    // Native detection has no knowledge of adapter-declared signatures. Probe only
    // when it has not already confirmed magic, plus ambiguous .m source files.
    const probe=/\.m$/i.test(file.name)||!file.detectionSource.includes('magic');
    const path=file.path??fallbackPath;
    const sample=probe&&path?new Uint8Array(await this.readRange(path,0,Math.min(65536,file.size))):undefined;
    return enhanceDescriptor(file,sample);
  }
  async load(path: string): Promise<FileDescriptor> {
    const file=await invoke<FileDescriptor>("load_file", { path });
    return this.describe(file,path);
  }
  async loadRelated(basePath: string, relative: string) {
    return this.describe(await invoke<FileDescriptor>("load_related_file", { basePath, relative }));
  }
  openUrl(url: string) {
    return invoke<void>("open_external_url", { url });
  }
  readRange(path: string, offset: number, length: number) {
    return invoke<number[]>("read_file_range", { path, offset, length });
  }
  revision(path: string) {
    return invoke<string>("file_revision", { path });
  }
  size(path: string) {
    return invoke<number>("file_size", { path });
  }
  openExternal(path: string) {
    return invoke<void>("open_file_external", { path });
  }
  reveal(path: string) {
    return invoke<void>("reveal_file", { path });
  }
}
export const tauriFileAdapter = new TauriFileAdapter();
export const fileLoader: FileLoader = {
  async loadPath(path) {
    if (!isTauri())
      throw new FileLoadError(
        "UNSUPPORTED_PATH",
        "Browser Preview cannot read local paths. Choose a browser file instead.",
      );
    try {
      return await tauriFileAdapter.load(path);
    } catch (error) {
      throw FileLoadError.from(error);
    }
  },
  async loadBrowserFile(file) {
    try {
      return await detectBrowserFile(file);
    } catch (error) {
      throw FileLoadError.from(error);
    }
  },
};
export { FileLoadError };
