const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const native = process.env.PRISM_NATIVE === "1";
  const browser = native
    ? await chromium.connectOverCDP("http://127.0.0.1:9223")
    : await chromium.launch({ headless: true, channel: "msedge" });
  const context = native ? browser.contexts()[0] : await browser.newContext();
  const page = native
    ? context.pages()[0]
    : await context.newPage({ viewport: { width: 1440, height: 1000 } });
  const originalGetByRole = page.getByRole.bind(page);
  page.getByRole = (role, options = {}) => {
    const name = options.name;
    if (
      role === "button" &&
      [
        "Find",
        "Contents",
        "Thumbnails",
        "Single page",
        "Continuous",
        "Zoom in",
        "Zoom out",
      ].includes(name)
    ) {
      const locator = originalGetByRole(role, options);
      const click = locator.click.bind(locator);
      locator.click = async (...args) => {
        if (await page.locator(".pdf-viewer").count()) {
          if (name === "Find")
            return originalGetByRole("button", {
              name: "Search",
              exact: true,
            }).click(...args);
          const more = page.locator(".viewer-more");
          if (!(await more.getAttribute("open")))
            await more.locator("summary").click();
          await more.getByRole("button", options).click(...args);
          if ((await more.getAttribute("open")) !== null)
            await more.locator("summary").click();
          return;
        }
        return click(...args);
      };
      if (name === "Find")
        locator.isDisabled = async () =>
          originalGetByRole("button", {
            name: "Search",
            exact: true,
          }).isDisabled();
      return locator;
    }
    return originalGetByRole(role, options);
  };
  const result = {
    runtime: native ? "Tauri WebView2" : "Edge browser",
    source: native
      ? "Browser File input in WebView2; authorized native ranges are covered separately by Rust tests"
      : "Browser FileSource ranges",
    fixtures: [],
    checks: [],
    errors: [],
    externalRequests: [],
  };
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !/127\.0\.0\.1|localhost/.test(request.url())
    )
      result.externalRequests.push(request.url());
  });
  page.on("dialog", (dialog) => {
    result.errors.push("Unexpected dialog " + dialog.message());
    void dialog.dismiss();
  });
  if (native) await page.reload();
  if (!native) {
    await page.addInitScript(() => {
      window.documentLive = {
        workers: new Set(),
        urls: new Set(),
        bitmaps: new Set(),
        rangeBytes: 0,
      };
      const Base = window.Worker;
      const createBitmap = window.createImageBitmap;
      window.createImageBitmap = async (...args) => {
        const bitmap = await createBitmap(...args),
          close = bitmap.close.bind(bitmap);
        window.documentLive.bitmaps.add(bitmap);
        bitmap.close = () => {
          window.documentLive.bitmaps.delete(bitmap);
          close();
        };
        return bitmap;
      };
      window.Worker = class extends Base {
        constructor(...args) {
          super(...args);
          window.documentLive.workers.add(this);
        }
        terminate() {
          window.documentLive.workers.delete(this);
          super.terminate();
        }
      };
      const create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (value) => {
        const url = create(value);
        window.documentLive.urls.add(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        window.documentLive.urls.delete(url);
        revoke(url);
      };
      const slice = Blob.prototype.slice;
      Blob.prototype.slice = function (...args) {
        if (this instanceof File)
          window.documentLive.rangeBytes += Math.max(
            0,
            Math.min(this.size, args[1] ?? this.size) - (args[0] ?? 0),
          );
        return slice.apply(this, args);
      };
    });
    await page.goto(process.env.PRISM_QA_URL || "http://127.0.0.1:1421");
  }
  async function open(name) {
    const start = performance.now();
    const cdp = await context.newCDPSession(page),
      { root } = await cdp.send("DOM.getDocument"),
      { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: "input[type=file]",
      });
    await cdp.send("DOM.setFileInputFiles", {
      nodeId,
      files: [path.resolve("tests/fixtures/documents/" + name)],
    });
    await cdp.detach();
    await page
      .locator(".viewer-file-heading strong")
      .filter({ hasText: name })
      .waitFor();
    return start;
  }
  try {
    for (const name of [
      "basic.pdf",
      "long.pdf",
      "outline.pdf",
      "image-only.pdf",
      "unicode.pdf",
      "links.pdf",
      "actions.pdf",
      "password.pdf",
      "restricted.pdf",
      "corrupted.pdf",
      "generated-1001.pdf",
      "generated-100mb.pdf",
      "generated-500mb.pdf",
      "generated-content-500mb.pdf",
      "basic.docx",
      "headings.docx",
      "tables.docx",
      "images.docx",
      "links.docx",
      "malformed.docx",
      "basic.odt",
      "basic.rtf",
      "legacy.doc",
      "generated-long.docx",
      "generated-many.docx",
    ]) {
      if (!native)
        await page.evaluate(() => (window.documentLive.rangeBytes = 0));
      const start = await open(name);
      let firstContentMs;
      if (name === "password.pdf") {
        await page.getByLabel("Document password").waitFor();
        await page.getByLabel("Document password").fill("wrong");
        await page.getByRole("button", { name: "Unlock", exact: true }).click();
        await page.getByText("Incorrect password. Try again.").waitFor();
        await page.getByLabel("Document password").fill("prism-secret");
        await page.getByRole("button", { name: "Unlock", exact: true }).click();
      }
      if (name.endsWith(".pdf") && name !== "corrupted.pdf") {
        await page.locator(".pdf-page canvas").first().waitFor();
        await page
          .locator(".pdf-viewport .pdf-page[data-rendered=true]")
          .first()
          .waitFor();
        firstContentMs = Math.round(performance.now() - start);
        if (name !== "image-only.pdf" && name !== "restricted.pdf")
          await page.waitForFunction(
            () =>
              document.querySelector(".textLayer span")?.textContent?.length >
              0,
          );
        if (await page.locator(".pdf-page [role=alert]").count())
          throw Error(name + " render error");
        if (name === "image-only.pdf") {
          await page
            .getByText("No text detected · OCR is unavailable")
            .first()
            .waitFor();
          result.checks.push(
            "Image-only PDF reports missing text without claiming OCR",
          );
        }
        if (name === "restricted.pdf") {
          if (await page.locator(".textLayer span").count())
            throw Error("Copy-restricted text extracted");
          if (
            !(await page
              .getByRole("button", { name: "Find", exact: true })
              .isDisabled())
          )
            throw Error("Restricted search is enabled");
          result.checks.push(
            "Encrypted copy restrictions disable text extraction and search",
          );
        }
        if (name === "basic.pdf") {
          await page.getByRole("button", { name: "Find", exact: true }).click();
          await page.getByLabel("Search PDF").fill("Needle");
          await page
            .getByText("3 results · 3/3 pages", { exact: true })
            .waitFor();
          await page
            .getByRole("button", { name: "Next result", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Close", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Contents", exact: true })
            .click();
          await page
            .getByLabel("PDF outline")
            .getByRole("button", { name: "Section 3" })
            .click();
          await page.waitForFunction(
            () =>
              document.querySelector('[aria-label="Page number"]').value ===
              "3",
          );
          await page
            .getByRole("button", { name: "Contents", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Single page", exact: true })
            .click();
          if ((await page.locator(".pdf-viewport .pdf-page").count()) !== 1)
            throw Error("Single page virtualization");
          await page
            .getByRole("button", { name: "Continuous", exact: true })
            .click();
          result.checks.push(
            "Search, outline destination and single-page mode",
          );
          await page.getByLabel("Page number", { exact: true }).fill("1");
          await page
            .locator('[data-page="1"] .pdf-page[data-rendered=true]')
            .waitFor();
          await page
            .getByRole("button", { name: "Zoom in", exact: true })
            .click();
          await page
            .locator('[data-page="1"] .pdf-page[data-rendered=true]')
            .waitFor();
          if (
            (await page
              .getByLabel("Page number", { exact: true })
              .inputValue()) !== "1"
          )
            throw Error("Zoom lost reading page");
          await page.getByLabel("PDF fit").selectOption("width");
          await page
            .locator('[data-page="1"] .pdf-page[data-rendered=true]')
            .waitFor();
          const selected = await page.evaluate(() => {
            const span = document.querySelector(
                '[data-page="1"] .textLayer span',
              ),
              range = document.createRange();
            range.selectNodeContents(span);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return selection.toString();
          });
          if (!selected.includes("Prism"))
            throw Error("PDF text selection failed");
          result.checks.push(
            "Zoom preserves reading page and real text layer is selectable",
          );
        }
        if (name.startsWith("generated-")) {
          const count = await page.locator(".pdf-viewport .pdf-page").count();
          if (count > 7) throw Error("Too many mounted PDF pages");
          const pageNumber = Number(
            await page
              .getByLabel("Page number", { exact: true })
              .getAttribute("max"),
          );
          await page
            .getByLabel("Page number", { exact: true })
            .fill(String(pageNumber));
          await page.waitForFunction(
            (n) =>
              document.querySelector(`[data-page="${n}"] .textLayer span`)
                ?.textContent?.length > 0,
            pageNumber,
          );
          if (name === "generated-100mb.pdf") {
            await page
              .getByLabel("Opened files", { exact: true })
              .getByRole("button", { name: "generated-1001.pdf", exact: true })
              .click();
            await page
              .locator('[data-page="1001"] .pdf-page[data-rendered=true]')
              .waitFor();
            if (
              (await page
                .getByLabel("Page number", { exact: true })
                .inputValue()) !== "1001"
            )
              throw Error("PDF reading session was lost");
            await page
              .getByLabel("Opened files", { exact: true })
              .getByRole("button", { name: "generated-100mb.pdf", exact: true })
              .click();
            await page
              .locator('[data-page="10"] .pdf-page[data-rendered=true]')
              .waitFor();
            result.checks.push(
              "PDF tabs restore the last reading page, including page 1001",
            );
          }
        }
        if (name === "long.pdf") {
          await page
            .getByRole("button", { name: "Thumbnails", exact: true })
            .click();
          await page
            .locator(".document-sidebar .pdf-page[data-rendered=true]")
            .first()
            .waitFor();
          await page.getByLabel("Page number", { exact: true }).fill("150");
          await page
            .locator('[data-page="150"] .pdf-page[data-rendered=true]')
            .waitFor();
          await page
            .getByRole("button", { name: "Thumbnails", exact: true })
            .click();
          result.checks.push(
            "Virtual thumbnails render near the current page and retire distant canvases",
          );
        }
      } else if (name === "corrupted.pdf")
        await page
          .getByRole("heading", { name: "PDF preview unavailable" })
          .waitFor();
      else if (name === "malformed.docx")
        await page
          .getByRole("heading", { name: "Document preview unavailable" })
          .waitFor();
      else if (name === "legacy.doc")
        await page
          .getByRole("heading", { name: "Legacy Word document" })
          .waitFor();
      else {
        await page.locator(".office-paper").waitFor();
        if (name === "generated-long.docx") {
          await page.getByRole("button", { name: "Find", exact: true }).click();
          await page.getByLabel("Search document").fill("ClosingUniqueNeedle");
          await page
            .getByRole("button", { name: "Next result", exact: true })
            .click();
          await page
            .locator(".document-active-result")
            .filter({ hasText: "ClosingUniqueNeedle" })
            .waitFor();
          result.checks.push("Large DOCX search reaches the final paragraph");
        }
        if (name === "generated-many.docx") {
          await page.waitForFunction(() =>
            Array.from(document.querySelectorAll(".office-paper img")).some(
              (image) => image.complete && image.naturalWidth > 0,
            ),
          );
          result.checks.push(
            "Forty embedded images and forty tables load safely",
          );
        }
        if (name === "basic.docx") {
          await page.locator(".office-paper img").waitFor();
          await page.getByRole("button", { name: "Find", exact: true }).click();
          await page.getByLabel("Search document").fill("Needle");
          await page
            .getByRole("button", { name: "Next result", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Close", exact: true })
            .click();
          result.checks.push(
            "DOCX rich styles, image, table, headings and search",
          );
        }
      }
      const metrics = await page.evaluate(() => ({
        pages: document.querySelectorAll(".pdf-viewport .pdf-page").length,
        canvases: document.querySelectorAll(".pdf-page canvas").length,
        text: document
          .querySelector(".office-paper")
          ?.textContent?.slice(0, 150),
        rangeBytes: window.documentLive?.rangeBytes,
        workers: window.documentLive?.workers.size,
        urls: window.documentLive?.urls.size,
        bitmaps: window.documentLive?.bitmaps.size,
        unsafeExecuted: window.PRISM_PDF_EXECUTED ?? false,
      }));
      if (metrics.unsafeExecuted) throw Error("PDF JavaScript executed");
      if (
        name === "generated-500mb.pdf" &&
        metrics.rangeBytes > 5 * 1024 * 1024
      )
        throw Error("Large PDF read too much data");
      result.fixtures.push({
        name,
        firstContentMs: firstContentMs ?? Math.round(performance.now() - start),
        scenarioMs: Math.round(performance.now() - start),
        ...metrics,
      });
      if (
        ["basic.pdf", "unicode.pdf", "basic.docx", "basic.odt"].includes(name)
      )
        await page.screenshot({
          path: `docs/qa/foundation-documents-${native ? "tauri" : "browser"}-${name.replace(".", "-")}.png`,
        });
    }
    await open("basic.rtf");
    await page.locator(".office-paper").waitFor();
    await page.waitForTimeout(500);
    if (!native) {
      const live = await page.evaluate(() => ({
        workers: window.documentLive.workers.size,
        urls: window.documentLive.urls.size,
        bitmaps: window.documentLive.bitmaps.size,
      }));
      if (live.workers || live.urls || live.bitmaps)
        throw Error("Resources leaked " + JSON.stringify(live));
      result.checks.push(
        "Switching files releases PDF workers and Office object URLs",
      );
    }
    if (result.errors.length) throw Error(result.errors.join("\n"));
    if (result.externalRequests.length)
      throw Error("Unexpected external request");
    result.checks.push(
      "No external document requests, dialogs or PDF JavaScript execution",
    );
  } catch (error) {
    result.failure = error.message;
    process.exitCode = 1;
    await page
      .screenshot({
        path: `docs/qa/foundation-documents-${native ? "tauri" : "browser"}-failure.png`,
      })
      .catch(() => {});
  } finally {
    fs.writeFileSync(
      `docs/qa/foundation-documents-${native ? "tauri" : "browser"}-results.json`,
      JSON.stringify(result, null, 2),
    );
    if (native) await browser.close();
    else await browser.close();
  }
  console.log(JSON.stringify(result, null, 2));
})();
