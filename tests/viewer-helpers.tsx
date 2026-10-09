import { vi } from "vitest";
import { resolveSample } from "../src/services/detection/browserDetector";
import { BrowserFileSource } from "../src/services/fileSource";
import type { ViewerPlugin, ViewerContext } from "../src/viewer/core/types";
export const descriptor = (name = "sample.txt") =>
  resolveSample(name, new TextEncoder().encode("hello 世界"), 12);
export const source = (text = "hello 世界") =>
  new BrowserFileSource(new File([text], "sample.txt"));
export const input = (name = "sample.txt") => ({
  file: descriptor(name),
  source: source(),
  services: { file: {} },
});
export function testPlugin(
  id = "TestFastViewer",
  options: Partial<ViewerPlugin<string>> = {},
): ViewerPlugin<string> {
  return {
    id,
    name: id,
    supportedTypes: ["text"],
    priority: 10,
    capabilities: {},
    load: vi.fn(async (context) => context.file.name),
    render: ({ model }) => <p>{`Model: ${model}`}</p>,
    dispose: vi.fn(),
    ...options,
  };
}
export const waitModel = (context: ViewerContext, ms: number) =>
  new Promise<string>((resolve) =>
    setTimeout(() => resolve(context.file.name), ms),
  );
