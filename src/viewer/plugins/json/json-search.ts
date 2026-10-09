import type { JsonDocumentModel } from "./json-model";
import { valueText } from "./json-parser";
import { JSON_CONFIG } from "./json-config";
import { checkAbort } from "../../core/errors";
export type JsonSearchScope = "keys" | "values" | "both";
export async function searchJson(
  model: JsonDocumentModel,
  query: string,
  scope: JsonSearchScope,
  signal: AbortSignal,
): Promise<{ matches: number[]; limited: boolean }> {
  const matches: number[] = [],
    needle = query.toLocaleLowerCase();
  if (!needle) return { matches, limited: false };
  for (let index = 0; index < model.nodes.length; index++) {
    if (index % 2000 === 0) {
      checkAbort(signal);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkAbort(signal);
    }
    const node = model.nodes[index];
    const keyMatch =
      scope !== "values" &&
      node.parent >= 0 &&
      node.key.toLocaleLowerCase().includes(needle);
    const valueMatch =
      scope !== "keys" &&
      !node.children &&
      valueText(node)
        .slice(0, JSON_CONFIG.searchValueChars)
        .toLocaleLowerCase()
        .includes(needle);
    if (keyMatch || valueMatch) {
      if (matches.length === JSON_CONFIG.searchResults)
        return { matches, limited: true };
      matches.push(index);
    }
  }
  return { matches, limited: false };
}
