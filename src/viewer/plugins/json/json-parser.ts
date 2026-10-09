import { visit, printParseErrorCode } from "jsonc-parser";
import { JSON_CONFIG } from "./json-config";
import type { JsonDocumentModel, JsonNode, JsonNodeType } from "./json-model";
import { escapePointer } from "./json-pointer";
export function emptyModel(
  source: string,
  status: JsonDocumentModel["status"],
): JsonDocumentModel {
  return {
    source,
    status,
    nodes: [],
    pointers: new Map(),
    stats: {
      nodes: 0,
      object: 0,
      array: 0,
      string: 0,
      number: 0,
      boolean: 0,
      null: 0,
      maxDepth: 0,
      duplicateKeys: 0,
      precisionRisks: 0,
    },
    diagnostics: [],
    truncated: false,
  };
}
/** Strict visitor parsing keeps only source + one flat store, never a duplicate JS object tree. */
export function parseJsonDocument(source: string): JsonDocumentModel {
  const model = emptyModel(source, source.trim() ? "ready" : "empty");
  if (model.status === "empty") return model;
  const stack: { index: number; key?: string; keys?: Set<string> }[] = [];
  let pointerChars = 0;
  const add = (
    type: JsonNodeType,
    offset: number,
    length: number,
    value?: JsonNode["value"],
  ) => {
    if (
      model.nodes.length >= JSON_CONFIG.maxNodes ||
      stack.length > JSON_CONFIG.maxDepth
    )
      throw new RangeError(
        "Structure exceeds the node or nesting limit. Source remains available.",
      );
    const frame = stack.at(-1),
      parent = frame?.index ?? -1;
    const siblings = parent >= 0 ? model.nodes[parent].children! : [];
    const key = frame
      ? model.nodes[parent].type === "array"
        ? String(siblings.length)
        : (frame.key ?? "")
      : "$";
    const pointer =
      parent < 0 ? "" : `${model.nodes[parent].pointer}/${escapePointer(key)}`;
    pointerChars += pointer.length;
    if (pointerChars > JSON_CONFIG.maxPointerChars)
      throw new RangeError(
        "Structure exceeds the path storage budget. Source remains available.",
      );
    const index = model.nodes.length;
    model.nodes.push({
      id: `${pointer}@${offset}`,
      pointer,
      key,
      type,
      parent,
      position: siblings.length + 1,
      depth: stack.length,
      offset,
      length,
      value,
      ...(type === "object" || type === "array" ? { children: [] } : {}),
    });
    if (frame) {
      siblings.push(index);
      frame.key = undefined;
      const parentNode = model.nodes[parent];
      if (parentNode.type === "array") {
        if (type === "object")
          parentNode.objectItems = (parentNode.objectItems ?? 0) + 1;
        if (type !== "object" && type !== "array")
          parentNode.primitiveItems = (parentNode.primitiveItems ?? 0) + 1;
      }
    }
    model.pointers.set(pointer, index);
    model.stats.nodes++;
    model.stats[type]++;
    model.stats.maxDepth = Math.max(model.stats.maxDepth, stack.length);
    return index;
  };
  const begin = (type: "object" | "array", offset: number) => {
    stack.push({
      index: add(type, offset, 1),
      ...(type === "object" ? { keys: new Set<string>() } : {}),
    });
  };
  const end = (offset: number, length: number) => {
    const frame = stack.pop();
    if (frame)
      model.nodes[frame.index].length =
        offset + length - model.nodes[frame.index].offset;
  };
  try {
    visit(
      source,
      {
        onObjectBegin: (offset) => begin("object", offset),
        onArrayBegin: (offset) => begin("array", offset),
        onObjectEnd: end,
        onArrayEnd: end,
        onObjectProperty: (key, offset, _length, line, column) => {
          const frame = stack.at(-1);
          if (!frame) return;
          frame.key = key;
          if (frame.keys?.has(key)) {
            model.stats.duplicateKeys++;
            if (model.diagnostics.length < 100)
              model.diagnostics.push({
                kind: "warning",
                message: `Duplicate key: ${key.slice(0, 240)}. All occurrences are retained; path navigation resolves the last occurrence.`,
                offset,
                line: line + 1,
                column: column + 1,
              });
          }
          frame.keys?.add(key);
        },
        onLiteralValue: (value, offset, length) => {
          const type =
            value === null
              ? "null"
              : (typeof value as "string" | "number" | "boolean");
          const exact = source.slice(offset, offset + length);
          add(type, offset, length, type === "number" ? exact : value);
          if (type === "number") {
            const approximate = Number(exact);
            if (
              !Number.isFinite(approximate) ||
              (Number.isInteger(approximate) &&
                !Number.isSafeInteger(approximate))
            )
              model.stats.precisionRisks++;
          }
        },
        onError: (error, offset, _length, line, column) => {
          model.status = "invalid";
          if (model.diagnostics.length < 100)
            model.diagnostics.push({
              kind: "error",
              message: printParseErrorCode(error),
              offset,
              line: line + 1,
              column: column + 1,
            });
        },
      },
      {
        disallowComments: true,
        allowTrailingComma: false,
        allowEmptyContent: false,
      },
    );
  } catch (error) {
    model.status = "limited";
    model.diagnostics.push({
      kind: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to build JSON structure.",
    });
  }
  if (model.status !== "ready") {
    model.nodes = [];
    model.pointers.clear();
    model.stats = emptyModel("", "empty").stats;
  }
  return model;
}
export function rawNode(model: JsonDocumentModel, index: number): string {
  const node = model.nodes[index];
  return model.source.slice(node.offset, node.offset + node.length);
}
export function valueText(node: JsonNode): string {
  return node.type === "string"
    ? String(node.value)
    : node.type === "null"
      ? "null"
      : String(node.value ?? "");
}
export function flattenVisible(
  model: JsonDocumentModel,
  expanded: Set<number>,
): number[] {
  if (!model.nodes.length) return [];
  const rows: number[] = [],
    pending = [0];
  while (pending.length) {
    const index = pending.pop()!;
    rows.push(index);
    if (expanded.has(index)) {
      const children = model.nodes[index].children;
      if (children)
        for (let i = children.length - 1; i >= 0; i--)
          pending.push(children[i]);
    }
  }
  return rows;
}
