const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const results = [];
    await page.goto("http://127.0.0.1:1420/");
    await page
      .getByText("Browser Preview Mode · Local paths unavailable")
      .waitFor();
    for (const [name, type] of [
      ["sample.md", "MARKDOWN"],
      ["sample.json", "JSON"],
      ["sample.ts", "TYPESCRIPT"],
      ["sample.png", "PNG"],
      ["sample.pdf", "PDF"],
      ["sample.zip", "ZIP"],
      ["sample.xlsx", "XLSX"],
      ["sample.sqlite", "SQLITE"],
      ["unknown.bin", "UNKNOWN"],
      ["fake.jpg", "PNG"],
      ["utf16-le.txt", "TEXT"],
      ["sample.svg", "SVG"],
    ]) {
      await page
        .locator("input[type=file]")
        .setInputFiles(`tests/fixtures/files/${name}`);
      const inspector = page.getByRole("region", { name: "File Inspector" });
      await inspector.getByRole("heading", { name, exact: true }).waitFor();
      await inspector.getByText(type, { exact: true }).waitFor();
      results.push({
        name,
        detected: type,
        pathUnavailable: await inspector
          .getByText("Unavailable in Browser Preview", { exact: true })
          .isVisible(),
      });
      if (name === "fake.jpg") {
        await inspector
          .getByText("EXTENSION_MISMATCH", { exact: true })
          .waitFor();
        await page.screenshot({
          path: "docs/qa/screenshots/module-02-browser-mismatch.png",
          fullPage: true,
        });
      }
    }
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
    const report = { results, resize, errors };
    fs.writeFileSync(
      "docs/qa/module-02-browser-results.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (errors.length || resize.some((r) => r.overflow)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
