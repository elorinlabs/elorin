import {t} from '../i18n';
import { isTauri, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
export interface Selection {
  path: string;
  filename: string;
  kind: "file" | "folder" | "drop";
}
export function selectionFromPath(
  path: string,
  kind: Selection["kind"],
): Selection {
  return {
    path,
    filename:
      path
        .replace(/[\\/]+$/, "")
        .split(/[\\/]/)
        .pop() || path,
    kind,
  };
}
export interface FileSelectionService {
  select(kind: "file" | "folder"): Promise<Selection | null>;
  listenDrop(
    onDrop: (paths: string[]) => void,
    onHover: (hover: boolean) => void,
  ): Promise<() => void>;
}
export const fileSelectionService: FileSelectionService = {
  async select(kind) {
    if (!isTauri())
      throw new Error(
        "Native file selection is available in the Prism desktop app. Run the Tauri app to choose a file or folder.",
      );
    return invoke<Selection | null>("select_path", {
      directory: kind === "folder", title:t(kind === "folder" ? "Open Folder" : "Open File"),
    });
  },
  async listenDrop(onDrop, onHover) {
    if (!isTauri()) return () => {};
    const stopDrop = await listen<string[]>("prism://files-dropped", (event) =>
      onDrop(event.payload),
    );
    try {
      const stopHover = await getCurrentWebview().onDragDropEvent(
        ({ payload }) => {
          onHover(payload.type === "enter" || payload.type === "over");
        },
      );
      return () => {
        stopDrop();
        stopHover();
      };
    } catch (error) {
      stopDrop();
      throw error;
    }
  },
};
