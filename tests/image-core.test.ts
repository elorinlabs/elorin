import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  readImageHeader,
  enrichMetadata,
  validDimensions,
  orientedDimensions,
} from "../src/viewer/plugins/image/image-metadata";
import { sanitizeSvg } from "../src/viewer/plugins/image/svg-sanitizer";
import {
  anchoredZoom,
  imageCoordinates,
  initialImageView,
  orientationMatrix,
} from "../src/viewer/plugins/image/viewport";
import {
  magicType,
  resolveSample,
} from "../src/services/detection/browserDetector";
const bytes = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/image/${name}`));
describe("Image metadata and routing", () => {
  it.each([
    ["basic.png", "png"],
    ["photo.jpg", "jpeg"],
    ["basic.webp", "webp"],
    ["basic.bmp", "bmp"],
    ["icon.ico", "ico"],
    ["first-page.tiff", "tiff"],
    ["animated.gif", "gif"],
    ["unsupported.heic", "heic"],
  ])("routes %s by magic and reads dimensions", (name, type) => {
    expect(magicType(bytes(name))).toBe(type);
    const m = readImageHeader(bytes(name), type);
    expect(validDimensions(m.width, m.height)).toBe(true);
    expect(
      resolveSample("fake.txt", bytes(name), bytes(name).length).detectedType,
    ).toBe(type);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "EXIF orientation %s",
    async (orientation) => {
      const data = bytes(`orientation-${orientation}.jpg`),
        m = readImageHeader(data, "jpeg");
      await enrichMetadata(m, data, []);
      expect(m.orientation).toBe(orientation);
      expect(orientedDimensions(m)).toEqual(
        orientation >= 5
          ? { width: 80, height: 160 }
          : { width: 160, height: 80 },
      );
      expect(m.photo.Camera).toBe("Test camera");
      expect(m.gps?.latitude).toBeCloseTo(31.2);
    },
  );
  it("retains ICO variants and TIFF page counts", () => {
    expect(readImageHeader(bytes("icon.ico"), "ico").variants?.length).toBe(3);
    expect(readImageHeader(bytes("first-page.tiff"), "tiff").pages).toBe(2);
  });
  it("does not invent color profiles", () => {
    expect(
      readImageHeader(bytes("basic.png"), "png").colorProfile,
    ).toBeUndefined();
    expect(readImageHeader(bytes("profile.jpg"), "jpeg").colorProfile).toBe(
      "Embedded ICC profile",
    );
    expect(readImageHeader(bytes("cmyk.jpg"), "jpeg").colorSpace).toBe("CMYK");
  });
  it("guards extreme dimensions", () => {
    expect(validDimensions(100000, 100000)).toBe(false);
    expect(validDimensions(20000, 20000)).toBe(true);
    expect(validDimensions(0, 10)).toBe(false);
  });
});
describe("Isolated SVG security", () => {
  it("preserves vector paint and local gradients", () => {
    const result = sanitizeSvg(
      readFileSync("tests/fixtures/image/basic.svg", "utf8"),
    );
    expect(result.removed).toBe(0);
    expect(result.source).toContain("url(#g)");
    expect(result.metadata.width).toBe(160);
  });
  it("removes scripts events foreign objects external resources and recursion", () => {
    const result = sanitizeSvg(
      readFileSync("tests/fixtures/image/unsafe.svg", "utf8"),
    );
    expect(result.removed).toBeGreaterThan(4);
    expect(result.source).not.toMatch(
      /script|onload|foreignObject|example.invalid|file:|<use/,
    );
  });
  it.each([
    "<svg><path></svg>",
    '<!DOCTYPE svg [<!ENTITY a "x">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="999999" height="999999"/>',
  ])("rejects malformed or dangerous document", (source) =>
    expect(() => sanitizeSvg(source)).toThrow(),
  );
  it("strips CSS escapes and remote url paints", () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.invalid/x)" style="stroke:u\\72l(http://x)"/></svg>',
    );
    expect(result.source).not.toContain("example.invalid");
    expect(result.source).not.toContain("stroke");
  });
});
describe("Image viewport", () => {
  it("keeps the cursor anchored while zooming", () => {
    const before = { ...initialImageView, x: 20, y: 30, zoom: 2 };
    const next = anchoredZoom(before, 4, 100, 80);
    expect((100 - next.x) / next.zoom).toBe((100 - before.x) / before.zoom);
    expect((80 - next.y) / next.zoom).toBe((80 - before.y) / before.zoom);
  });
  it("maps rotated and panned pointer back to image pixels", () => {
    expect(
      imageCoordinates(40, 0, 160, 80, { ...initialImageView, rotation: 90 }),
    ).toEqual({ x: 80, y: 0 });
    expect(
      imageCoordinates(20, 30, 160, 80, {
        ...initialImageView,
        x: 20,
        y: 30,
        zoom: 4,
      }),
    ).toEqual({ x: 80, y: 40 });
  });
  it("provides all eight orientation transforms", () => {
    expect(orientationMatrix(6, 160, 80)).toEqual([0, 1, -1, 0, 80, 0]);
    expect(orientationMatrix(8, 160, 80)).toEqual([0, -1, 1, 0, 0, 160]);
    expect(orientationMatrix(2, 160, 80)).toEqual([-1, 0, 0, 1, 160, 0]);
  });
});
