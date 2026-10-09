const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223"),
    page = browser.contexts()[0].pages()[0],
    result = {
      runtime: "Tauri / WebView2",
      source:
        "Browser File input; native authorized decoder tested separately by Rust",
      fixtures: [],
      errors: [],
    };
  page.on("pageerror", (e) => result.errors.push(e.message));
  result.nativeUnauthorized = await page.evaluate(async (path) => {
    try {
      await window.__TAURI_INTERNALS__.invoke("decode_image_preview", { path });
      return "unexpected success";
    } catch (error) {
      return error.code;
    }
  }, path.resolve("tests/fixtures/image/generated-100mp.jpg"));
  if (result.nativeUnauthorized !== "PERMISSION_DENIED")
    throw Error("Native decoder bypassed file grants");
  try {
    for (const [name, error] of [
      ["basic.png", false],
      ["transparent.png", false],
      ["orientation-6.jpg", false],
      ["orientation-8.jpg", false],
      ["cmyk.jpg", false],
      ["animated.gif", false],
      ["animated.webp", false],
      ["basic.svg", false],
      ["unsafe.svg", false],
      ["malformed.svg", true],
      ["first-page.tiff", false],
      ["basic.avif", false],
      ["unsupported.heic", true],
      ["generated-example.heic", true],
      ["generated-100mp.png", false],
    ]) {
      const start = performance.now(),
        cdp = await page.context().newCDPSession(page),
        { root } = await cdp.send("DOM.getDocument"),
        { nodeId } = await cdp.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: "input[type=file]",
        });
      await cdp.send("DOM.setFileInputFiles", {
        nodeId,
        files: [path.resolve("tests/fixtures/image/" + name)],
      });
      await cdp.detach();
      await page
        .locator(".viewer-file-heading strong")
        .filter({ hasText: name })
        .waitFor();
      await page.getByLabel("Image viewer", { exact: true }).waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector(".image-error") ||
          document.querySelector(".image-viewer canvas")?.width > 0,
      );
      if (Boolean(await page.locator(".image-error").count()) !== error)
        throw Error(name + " incorrect result");
      result.fixtures.push({
        name,
        firstVisibleMs: Math.round(performance.now() - start),
        error,
      });
      if (name.startsWith("animated.")) {
        await page
          .getByRole("button", { name: "Pause", exact: true })
          .waitFor();
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await page.getByRole("button", { name: "Play", exact: true }).waitFor();
      }
    }
    await page.screenshot({
      path: "docs/qa/module-08-tauri.png",
      fullPage: true,
    });
    if (result.errors.length) throw Error(result.errors.join("; "));
  } catch (error) {
    result.failure = error.stack;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(
      "docs/qa/module-08-tauri-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
  }
})();
