const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
    });
    const errors = [],
      requests = [],
      results = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(process.env.PRISM_QA_URL || "http://127.0.0.1:1420/");
    await page
      .getByRole("button", { name: "Open File", exact: true })
      .waitFor();
    const initiallyLoadedFallbacks = requests.filter((url) =>
      /(?:text|binary)Fallback/.test(url),
    );
    for (const [name, text] of [
      ["sample.txt", true],
      ["sample.md", true],
      ["sample.json", true],
      ["sample.ts", true],
      ["utf16-le.txt", true],
      ["unknown.bin", false],
      ["sample.pdf", false],
      ["sample.zip", false],
    ]) {
      const start = Date.now();
      await page
        .locator("input[type=file]")
        .setInputFiles(`tests/fixtures/files/${name}`);
      await page
        .locator(".viewer-file-heading strong")
        .filter({ hasText: name })
        .waitFor();
      if (name === "sample.md") await page.getByLabel("Markdown document").waitFor();
      else if (name === "sample.json") await page.getByRole('tree', { name: 'JSON structure' }).waitFor();
      else if (text) await page.getByLabel("Read-only text").waitFor();
      else
        await page.getByText("Preview unavailable", { exact: true }).waitFor();
      results.push({
        name,
        preview: name === "sample.json" ? "JSON tree" : name === "sample.md" ? "Markdown reading view" : text ? "plain text" : "unavailable",
        elapsedMs: Date.now() - start,
      });
    }
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "unknown.data",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("Unknown text / 未知文本"),
      });
    await page
      .getByLabel("Read-only text")
      .filter({ hasText: "未知文本" })
      .waitFor();
    const start = Date.now();
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "large.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(9 * 1024 * 1024, 120),
      });
    await page
      .getByText(
        "Showing the first 256 KiB. The full file has not been loaded.",
      )
      .waitFor();
    const large = {
      fileBytes: 9 * 1024 * 1024,
      renderedCharacters: (
        await page.getByLabel("Read-only text").textContent()
      ).length,
      elapsedMs: Date.now() - start,
    };
    if (large.renderedCharacters !== 262144)
      throw new Error("Text preview was not bounded");
    await page.getByLabel("Wrap lines").uncheck();
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "sample.txt", exact: true })
      .click();
    await page.getByLabel("Read-only text").waitFor();
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "large.txt", exact: true })
      .click();
    if (await page.getByLabel("Wrap lines").isChecked())
      throw new Error("Session state did not restore");
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "unicode.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "Prism — read beautifully.\n中文 · English · 日本語\n\nA calm, read-only space for every text file.\n".repeat(
            15,
          ),
        ),
      });
    await page
      .getByLabel("Read-only text")
      .filter({ hasText: "日本語" })
      .waitFor();
    await page.locator(".file-inspector-details > summary").click();
    const resize = [];
    for (const width of [1920, 1440, 1024, 900]) {
      await page.setViewportSize({ width, height: 1080 });
      resize.push({
        width,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    fs.mkdirSync("docs/qa/screenshots", { recursive: true });
    await page.screenshot({
      path: "docs/qa/screenshots/module-03-text.png",
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "unknown.bin", exact: true })
      .click();
    await page.getByText("Preview unavailable", { exact: true }).waitFor();
    await page.screenshot({
      path: "docs/qa/screenshots/module-03-binary.png",
      fullPage: true,
    });
    const report = {
      results,
      initiallyLoadedFallbacks,
      large,
      resize,
      errors,
      viewerInspectorVisible: await page.locator(".viewer-debug").count(),
      sessionRestored: true,
    };
    const name = process.env.PRISM_QA_URL ? "production" : "browser";
    fs.writeFileSync(
      `docs/qa/module-03-${name}-results.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (
      errors.length ||
      initiallyLoadedFallbacks.length ||
      resize.some((item) => item.overflow)
    )
      process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
