import type { RecentFile } from "../services/recentFiles";
export function createRecentFilesFixture(now = Date.now()): RecentFile[] {
  return [
    ["Design Guidelines.pdf", "~/Documents/Design", "pdf", 2],
    ["project.ts", "~/Projects/prism", "ts", 5],
    ["Landscape.jpg", "~/Pictures", "jpg", 24],
    ["Sales Data.xlsx", "~/Documents/Data", "xlsx", 48],
  ].map(([name, path, extension, hours], index) => ({
    id: `fixture-${index}`,
    name: String(name),
    path: String(path),
    extension: String(extension),
    lastOpened: now - Number(hours) * 3600000,
  }));
}
