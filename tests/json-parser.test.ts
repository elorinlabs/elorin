import { describe, it, expect } from "vitest";
import {
  parseJsonDocument,
  rawNode,
  flattenVisible,
  valueText,
} from "../src/viewer/plugins/json/json-parser";
import {
  escapePointer,
  friendlyPath,
  resolvePointer,
  ancestors,
} from "../src/viewer/plugins/json/json-pointer";
import { searchJson } from "../src/viewer/plugins/json/json-search";
import { JSON_CONFIG } from "../src/viewer/plugins/json/json-config";
import { resolveSample } from "../src/services/detection/browserDetector";

describe("JSON document model", () => {
  it("builds one flat store with cached types and root-zero depth", () => {
    const model = parseJsonDocument('{"a":{"b":1},"items":["x",true,null]}');
    expect(model.status).toBe("ready");
    expect(model.stats).toMatchObject({
      nodes: 7,
      object: 2,
      array: 1,
      number: 1,
      string: 1,
      boolean: 1,
      null: 1,
      maxDepth: 2,
    });
    expect(model.nodes[resolvePointer(model, "/items")!].primitiveItems).toBe(
      3,
    );
    expect(rawNode(model, resolvePointer(model, "/a")!)).toBe('{"b":1}');
  });
  it.each(["42", '"hello"', "true", "false", "null", "{}", "[]"])(
    "accepts root %s",
    (source) => {
      const model = parseJsonDocument(source);
      expect(model.status).toBe("ready");
      expect(model.nodes).toHaveLength(1);
      expect(model.nodes[0].depth).toBe(0);
      expect(rawNode(model, 0)).toBe(source);
    },
  );
  it("preserves exact numeric tokens including decimal/exponent/negative zero", () => {
    for (const token of [
      "9223372036854775807",
      "12345678901234567890.123456789",
      "1e400",
      "-0",
      "0.100000000000000000001",
    ]) {
      const model = parseJsonDocument(token);
      expect(model.status).toBe("ready");
      expect(valueText(model.nodes[0])).toBe(token);
      expect(rawNode(model, 0)).toBe(token);
    }
    expect(parseJsonDocument("9223372036854775807").stats.precisionRisks).toBe(
      1,
    );
  });
  it("retains duplicate members and resolves canonical pointer to last occurrence with diagnostics", () => {
    const model = parseJsonDocument(
      '{"name":"A","name":"B","nested":{"x":1,"x":2}}',
    );
    expect(model.stats.duplicateKeys).toBe(2);
    expect(model.diagnostics).toHaveLength(2);
    expect(
      model.nodes
        .filter((node) => node.pointer === "/name")
        .map((node) => node.value),
    ).toEqual(["A", "B"]);
    expect(model.nodes[resolvePointer(model, "/name")!].value).toBe("B");
    expect(new Set(model.nodes.map((node) => node.id)).size).toBe(
      model.nodes.length,
    );
  });
  it("uses RFC6901 escaping, literal empty keys, array indices and display-only friendly paths", () => {
    const model = parseJsonDocument(
      '{"a/b":{"~key":[{"user.name":"棱镜🪩"}]},"":1}',
    );
    expect(escapePointer("a/b~")).toBe("a~1b~0");
    const index = resolvePointer(model, "/a~1b/~0key/0/user.name")!;
    expect(model.nodes[index].value).toBe("棱镜🪩");
    expect(friendlyPath(model, index)).toBe('$["a/b"]["~key"][0]["user.name"]');
    expect(ancestors(model, index)).toHaveLength(4);
    expect(resolvePointer(model, "/")).toBeDefined();
    for (const path of [
      "/missing",
      "/a~2b",
      "a/b",
      "/a~1b/~0key/00",
      "/a~1b/~0key/999",
    ])
      expect(resolvePointer(model, path)).toBeUndefined();
  });
  it.each([
    '{"a":1,}',
    "/* comment */ {}",
    '{"a":}',
    "{",
    "[1] [2]",
    "undefined",
  ])(
    "rejects strict-invalid input %s without publishing recovered nodes",
    (source) => {
      const model = parseJsonDocument(source);
      expect(model.status).toBe("invalid");
      expect(model.nodes).toHaveLength(0);
      expect(model.source).toBe(source);
      expect(model.diagnostics.some((item) => item.line && item.column)).toBe(
        true,
      );
    },
  );
  it("empty source is distinct from valid empty structures", () => {
    expect(parseJsonDocument(" \r\n").status).toBe("empty");
    expect(parseJsonDocument("{}").status).toBe("ready");
  });
  it("allows 50 levels and bounds pathological nesting", () => {
    expect(
      parseJsonDocument("[".repeat(50) + "1" + "]".repeat(50)).stats.maxDepth,
    ).toBe(50);
    const deep = parseJsonDocument("[".repeat(300) + "1" + "]".repeat(300));
    expect(deep.status).toBe("limited");
    expect(deep.nodes).toHaveLength(0);
  });
  it("bounds path storage amplification while retaining original Source", () => {
    let value: unknown = Array(1000).fill(1);
    for (let i = 0; i < 10; i++) value = { ["K".repeat(2048)]: value };
    const source = JSON.stringify(value),
      model = parseJsonDocument(source);
    expect(model.status).toBe("limited");
    expect(model.nodes).toHaveLength(0);
    expect(model.diagnostics.at(-1)?.message).toContain("path storage budget");
    expect(model.source).toBe(source);
  });
  it("flattens only expanded branches, independently of DOM", () => {
    const model = parseJsonDocument('{"items":[{"name":"Alice"}],"other":1}');
    expect(flattenVisible(model, new Set())).toEqual([0]);
    expect(flattenVisible(model, new Set([0]))).toHaveLength(3);
    expect(
      flattenVisible(
        model,
        new Set(ancestors(model, resolvePointer(model, "/items/0/name")!)),
      ),
    ).toHaveLength(5);
  });
  it.each(["json", "geojson", "jsonl", "ndjson"])(
    "Module02 routes .%s to a JSON descriptor",
    (extension) => {
      expect(
        resolveSample(
          `sample.${extension}`,
          new TextEncoder().encode("ordinary"),
          8,
        ).detectedType,
      ).toBe("json");
    },
  );
  it.each(["application/json", "application/geo+json", "text/json"])(
    "Module02 normalizes MIME %s",
    (mime) => {
      expect(
        resolveSample("data", new TextEncoder().encode("42"), 2, mime)
          .detectedType,
      ).toBe("json");
    },
  );
});

describe("JSON structured search", () => {
  it("searches keys, primitive values, both and Unicode without subtree stringify", async () => {
    const model = parseJsonDocument(
      '{"email":"other","nested":{"name":"EMAIL"},"city":"東京"}',
    );
    const search = (query: string, scope: "keys" | "values" | "both") =>
      searchJson(model, query, scope, new AbortController().signal);
    expect(
      (await search("email", "keys")).matches.map(
        (index) => model.nodes[index].pointer,
      ),
    ).toEqual(["/email"]);
    expect(
      (await search("email", "values")).matches.map(
        (index) => model.nodes[index].pointer,
      ),
    ).toEqual(["/nested/name"]);
    expect((await search("email", "both")).matches).toHaveLength(2);
    expect((await search("東京", "values")).matches).toHaveLength(1);
  });
  it("caps results at 500 and cancels an obsolete scan", async () => {
    const model = parseJsonDocument(JSON.stringify(Array(900).fill("match")));
    const result = await searchJson(
      model,
      "match",
      "values",
      new AbortController().signal,
    );
    expect(result.matches).toHaveLength(JSON_CONFIG.searchResults);
    expect(result.limited).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      searchJson(model, "match", "both", controller.signal),
    ).rejects.toHaveProperty("code", "ABORTED");
  });
});
