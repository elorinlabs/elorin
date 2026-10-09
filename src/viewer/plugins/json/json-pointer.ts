import type { JsonDocumentModel } from "./json-model";
export const escapePointer = (key: string) =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");
export function resolvePointer(
  model: JsonDocumentModel,
  pointer: string,
): number | undefined {
  if (
    pointer !== "" &&
    (!pointer.startsWith("/") || /~(?![01])/u.test(pointer))
  )
    return;
  return model.pointers.get(pointer);
}
export function ancestors(model: JsonDocumentModel, index: number): number[] {
  const result: number[] = [];
  for (
    let parent = model.nodes[index]?.parent ?? -1;
    parent >= 0;
    parent = model.nodes[parent].parent
  )
    result.push(parent);
  return result.reverse();
}
export function friendlyPath(model: JsonDocumentModel, index: number): string {
  const chain = [...ancestors(model, index), index];
  let path = "$";
  for (const current of chain.slice(1)) {
    const node = model.nodes[current];
    const parent = model.nodes[node.parent];
    path +=
      parent.type === "array"
        ? `[${node.key}]`
        : /^[A-Za-z_$][\w$]*$/.test(node.key)
          ? `.${node.key}`
          : `[${JSON.stringify(node.key)}]`;
  }
  return path;
}
