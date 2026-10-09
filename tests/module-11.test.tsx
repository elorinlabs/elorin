import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import { render, screen, cleanup } from "@testing-library/react";
import { detectBrowserFile } from "../src/services/detection/browserDetector";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import {
  loadEpub,
  readChapter,
  epubTarget,
} from "../src/viewer/plugins/publishing/epub-model";
import { loadEmail } from "../src/viewer/plugins/email/email-model";
import {
  sanitizeDocument,
  SafeDocument,
  safeDeclarations,
} from "../src/viewer/shared/safe-document";
import { PlaybackController } from "../src/viewer/plugins/media/PlaybackController";
import {
  probeMedia,
  SourceTokenizer,
} from "../src/viewer/plugins/media/media-probe";
import { virtualResource, safeFilename } from "../src/services/virtualResource";
import { MemoryFileSource } from "../src/services/fileSource";
import type { ViewerContext } from "../src/viewer/core/types";
const releases: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal("Worker", undefined);
  vi.stubGlobal("File", NodeFile);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:fixture"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Unexpected network");
    }),
  );
});
afterEach(() => {
  releases.splice(0).forEach((f) => f());
  cleanup();
  vi.unstubAllGlobals();
});
async function ctx(folder: string, name: string) {
  const bytes = new Uint8Array(readFileSync(`test-fixtures/${folder}/${name}`));
  const file = await detectBrowserFile(
    new NodeFile([bytes], name) as unknown as File,
  );
  return {
    file,
    signal: new AbortController().signal,
    source: {
      getSize: async () => bytes.length,
      readRange: async (at: number, length: number) =>
        bytes.slice(at, at + length),
    },
    onCleanup: (f: () => void) => {
      releases.push(f);
    },
    services: { file: {} },
  } as unknown as ViewerContext;
}
describe("Module 11 registry and signatures", () => {
  it.each([
    ["media/audio", "basic.mp3", "mp3", "audio"],
    ["media/audio", "basic.wav", "wav", "audio"],
    ["media/audio", "basic.flac", "flac", "audio"],
    ["media/audio", "basic.ogg", "ogg", "audio"],
    ["media/audio", "basic.opus", "opus", "audio"],
    ["media/video", "basic.mp4", "mp4", "video"],
    ["media/video", "basic.webm", "webm", "video"],
    ["media/video", "basic.mov", "mov", "video"],
    ["media/video", "basic.mkv", "mkv", "video"],
    ["media/video", "basic.avi", "avi", "video"],
    ["publishing", "basic.epub", "epub", "ebook"],
    ["email", "plain.eml", "eml", "email"],
    ["email", "basic.msg", "msg", "email"],
  ])("%s/%s routes safely", async (folder, name, type, plugin) => {
    const c = await ctx(folder, name);
    expect(c.file.detectedType).toBe(type);
    expect((await createBuiltinRegistry().resolve(c.file))?.id).toBe(plugin);
  });
  it("does not steal PDF/images/text/Office routing", async () => {
    const r = createBuiltinRegistry();
    for (const [type, id] of [
      ["pdf", "pdf"],
      ["png", "image"],
      ["text", "core.text-fallback"],
      ["docx", "office-document"],
      ["xlsx", "spreadsheet"],
    ]) {
      const c = await ctx("email", "plain.eml");
      c.file = {
        ...c.file,
        detectedType: type as typeof c.file.detectedType,
        isText: type === "text",
        isBinary: type !== "text",
      };
      expect((await r.resolve(c.file))?.id).toBe(id);
    }
  });
});
describe("Shared safe content boundary", () => {
  it("removes active content, event handlers, unsafe CSS and remote URLs before render", () => {
    const c = sanitizeDocument(
      '<script>window.evil=1</script><iframe src="https://bad.invalid"/><p onclick="evil()" style="position:fixed;z-index:99;background:url(https://bad.invalid);color:red">Safe</p><img src="https://bad.invalid/pixel"/><a href="javascript:evil()">Link</a>',
      () => undefined,
      (url) => (/^https:/.test(url) ? url : undefined),
    );
    render(<SafeDocument content={c} onLink={() => {}} />);
    expect(
      document.querySelector("script,iframe,object,embed,[onclick],[onerror]"),
    ).toBeNull();
    expect(document.querySelector('img[src^="http"]')).toBeNull();
    expect(
      document.querySelector("a")?.getAttribute("href") ?? null,
    ).toBeNull();
    expect(c.blocked).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows a scoped simple style but no network/fixed/extreme size", () => {
    expect(
      safeDeclarations(
        "color:red;font-weight:bold;position:fixed;background:url(x);font-size:999px",
      ),
    ).toBe("color:red;font-weight:bold");
  });
  it("preserves safe text / tables / local images / internal links", () => {
    const c = sanitizeDocument(
      '<h1>Hello</h1><table><tr><td>42</td></tr></table><img src="cid:x"/><a href="chapter">Chapter</a>',
      () => "blob:fixture",
      () => "prism-resource:OPS/ch.xhtml",
    );
    render(<SafeDocument content={c} onLink={() => {}} />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeVisible();
    expect(screen.getByRole("cell")).toHaveTextContent("42");
    expect(document.querySelector("img")?.src).toBe("blob:fixture");
  });
});
describe("EPUB", () => {
  it("parses metadata / spine / TOC and readable first chapter", async () => {
    const m = await loadEpub(await ctx("publishing", "basic.epub"));
    expect(m.error).toBeUndefined();
    expect(m.title).toBe("Prism Test Book");
    expect(m.chapters).toHaveLength(2);
    expect(m.nav).toHaveLength(2);
    expect(readChapter(m, 0).text).toContain("First chapter needle 中文");
    expect(readChapter(m, 1).text).toContain("Closing needle");
  });
  it("resolves package-local fragments and rejects escaped / executable targets", () => {
    expect(epubTarget("OPS/ch.xhtml", "chapter2.xhtml#end")).toBe(
      "prism-resource:OPS/chapter2.xhtml#end",
    );
    expect(epubTarget("OPS/ch.xhtml", "../../evil")).toBeUndefined();
    expect(epubTarget("OPS/ch.xhtml", "javascript:evil()")).toBeUndefined();
  });
  it("uses safe images and preserves table content", async () => {
    const m = await loadEpub(await ctx("publishing", "images.epub"));
    expect(JSON.stringify(readChapter(m, 0).tree)).toContain("blob:fixture");
    expect(
      readChapter(await loadEpub(await ctx("publishing", "tables.epub")), 0)
        .text,
    ).toContain("42");
  });
  it("blocks EPUB active content and does not fetch external resources", async () => {
    const m = await loadEpub(await ctx("publishing", "unsafe.epub"));
    const c = readChapter(m, 0);
    expect(c.text).toContain("Safe visible content");
    expect(c.text).not.toContain("unsafeExecuted");
    expect(c.blocked).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("recognizes fixed-layout and protected content without reflowing / decrypting", async () => {
    expect(
      (await loadEpub(await ctx("publishing", "fixed-layout.epub"))).fixed,
    ).toBe(true);
    expect(
      (await loadEpub(await ctx("publishing", "protected.epub"))).protected,
    ).toBe(true);
  });
  it.each(["malformed.epub", "xxe.epub", "traversal.epub", "zip-bomb.epub"])(
    "rejects %s",
    async (name) => {
      const m = await loadEpub(await ctx("publishing", name));
      if (m.error) expect(m.error).toBeTruthy();
      else expect(() => readChapter(m, 0)).toThrow();
    },
  );
  it("handles 120 chapters without parsing all chapter bodies on open", async () => {
    const m = await loadEpub(await ctx("publishing", "many-chapters.epub"));
    expect(m.chapters).toHaveLength(120);
    expect(readChapter(m, 119, false).text).toContain("FinalUniqueNeedle");
  });
});
describe("EML / MIME / virtual attachments", () => {
  it.each([
    ["plain.eml", "Plain message body"],
    ["html.eml", "HTML message"],
    ["multipart.eml", "Plain alternative"],
    ["unicode.eml", "中文邮件"],
    ["quoted-printable.eml", "Quoted café"],
    ["base64.eml", "Base64 decoded"],
  ])("decodes %s", async (name, text) => {
    const m = await loadEmail(await ctx("email", name));
    expect(m.error).toBeUndefined();
    expect(m.text).toContain(text);
    expect(m.email?.from?.address).toBe("alice@example.com");
    expect(m.email?.headers.length).toBeGreaterThan(3);
  });
  it("keeps alternatives, CID images and attachment bytes separately", async () => {
    const m = await loadEmail(await ctx("email", "inline-images.eml"));
    expect(m.rich).toBeTruthy();
    expect(JSON.stringify(m.rich?.tree)).toContain("blob:fixture");
    expect(m.attachments[0].cid).toBe("<picture1>");
    expect(m.text).toContain("Inline image plain");
  });
  it.each(["unsafe-html.eml", "remote-images.eml"])(
    "blocks trackers / active content in %s",
    async (name) => {
      const m = await loadEmail(await ctx("email", name));
      expect(m.error).toBeUndefined();
      expect(m.rich?.blocked).toBeGreaterThan(0);
      render(<SafeDocument content={m.rich!} onLink={() => {}} />);
      expect(
        document.querySelector(
          'script,iframe,[onerror],[onclick],img[src^="http"]',
        ),
      ).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("opens PDF/JSON/image/text attachments through descriptors and the actual registry", async () => {
    const c = await ctx("email", "attachments.eml"),
      opened: string[] = [];
    c.services.file.openResource = async (resource) => {
      expect(resource.file.path).toBeNull();
      expect(resource.source.virtualIdentity).toBeTruthy();
      expect(await resource.source.getSize()).toBeGreaterThan(0);
      opened.push((await createBuiltinRegistry().resolve(resource.file))!.id);
    };
    const m = await loadEmail(c);
    expect(m.error).toBeUndefined();
    for (let i = 0; i < 4; i++) await m.open(i);
    expect(opened).toEqual(["pdf", "json", "image", "core.text-fallback"]);
    expect(m.attachments[4].name).toBe("evil.exe");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports 25 attachments and clear malformed / MSG fallback", async () => {
    expect(
      (await loadEmail(await ctx("email", "many-attachments.eml"))).attachments
        .length,
    ).toBe(25);
    expect(
      (await loadEmail(await ctx("email", "malformed.eml"))).error,
    ).toBeTruthy();
    expect(
      (await loadEmail(await ctx("email", "basic.msg"))).limited,
    ).toContain("Limited support");
  });
  it("sanitizes resource names and never creates a filesystem path", async () => {
    expect(safeFilename("../../evil.exe")).toBe("evil.exe");
    const r = await virtualResource(
      "..\\data.json",
      new TextEncoder().encode('{"x":1}'),
      "application/json",
    );
    expect(r.file.name).toBe("data.json");
    expect(r.file.detectedType).toBe("json");
    expect(r.file.path).toBeNull();
  });
  it("cleanup releases inline URLs and decoded attachment buffers", async () => {
    const m = await loadEmail(await ctx("email", "inline-images.eml"));
    releases.splice(0).forEach((f) => f());
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(m.attachments).toHaveLength(0);
    expect(m.rich).toBeUndefined();
  });
});
describe("Media metadata and controller", () => {
  it.each([
    ["basic.wav", "WAVE"],
    ["basic.flac", "FLAC"],
    ["metadata.mp3", "MPEG"],
  ])("probes %s through FileSource ranges", async (name, container) => {
    const c = await ctx("media/audio", name),
      m = await probeMedia(c);
    expect(m.format.container?.toUpperCase()).toContain(container);
    expect(m.format.sampleRate).toBe(48000);
    if (name === "metadata.mp3") {
      expect(m.common.title).toBe("Prism Test Tone");
      expect(m.common.artist).toBe("Prism QA");
    }
  });
  it("reads embedded cover without decoding media payloads", async () => {
    const m = await probeMedia(await ctx("media/audio", "cover.mp3"));
    expect(m.common.picture?.[0].data.length).toBeGreaterThan(0);
  });
  it("random access skip does not read the skipped payload; cancellation stops reads", async () => {
    const c = await ctx("media/audio", "basic.wav"),
      t = new SourceTokenizer(c),
      read = vi.spyOn(c.source, "readRange");
    await t.ignore(100);
    expect(read).not.toHaveBeenCalled();
    const a = new AbortController();
    a.abort();
    c.signal = a.signal;
    await expect(t.readBuffer(new Uint8Array(4))).rejects.toThrow();
  });
  it("coordinates play/pause, seek, volume/mute, rate and releases element resources", async () => {
    const one = document.createElement("audio"),
      two = document.createElement("audio");
    for (const e of [one, two]) {
      let paused = true;
      Object.defineProperty(e, "paused", { get: () => paused });
      Object.defineProperty(e, "duration", { get: () => 100 });
      Object.defineProperty(e, "readyState", { get: () => 4 });
      e.play = vi.fn(async () => {
        paused = false;
        e.dispatchEvent(new Event("play"));
      });
      e.pause = vi.fn(() => {
        paused = true;
        e.dispatchEvent(new Event("pause"));
      });
      e.load = vi.fn();
    }
    const a = new PlaybackController(one),
      b = new PlaybackController(two);
    await a.play();
    expect(a.state.playing).toBe(true);
    a.seek(50);
    expect(one.currentTime).toBe(50);
    a.setVolume(0.4);
    expect(a.state.volume).toBe(0.4);
    a.mute();
    expect(a.state.muted).toBe(true);
    a.rate(1.5);
    expect(a.state.rate).toBe(1.5);
    await b.play();
    expect(one.pause).toHaveBeenCalled();
    expect(a.state.playing).toBe(false);
    a.dispose();
    b.dispose();
    expect(one.load).toHaveBeenCalled();
    expect(one.getAttribute("src")).toBeNull();
  });
});
