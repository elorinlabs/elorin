const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
    });
    const errors = [],
      dialogs = [],
      requests = [],
      fixtures = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(process.env.PRISM_QA_URL || "http://127.0.0.1:1420/");
    await page
      .getByRole("button", { name: "Open File", exact: true })
      .waitFor();
    const jsonAtStartup = requests.filter((url) =>
      /json\.plugin|json-parser|json.worker|jsonc-parser/.test(url),
    );
    const open = async (name) => {
      await page
        .locator("input[type=file]")
        .setInputFiles(`tests/fixtures/json/${name}`);
      await page
        .locator(".viewer-file-heading strong")
        .filter({ hasText: name })
        .waitFor();
    };
    const go = async (pointer) => {
      await page.getByLabel("JSON Pointer", { exact: true }).fill(pointer);
      await page.getByRole("button", { name: "Go", exact: true }).click();
    };
    await open("basic.json");
    await page.getByRole("tree").waitFor();
    await go("/modules/1/name");
    await page
      .getByRole("treeitem", { selected: true })
      .filter({ hasText: "JSON Viewer" })
      .waitFor();
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByLabel("JSON inspection", { exact: true }).waitFor();
    await go("/active");
    if (
      !(await page
        .getByLabel("JSON inspection", { exact: true })
        .getByText("SELECTED BOOLEAN")
        .isVisible())
    )
      throw new Error("Inspection did not follow selection");
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const source = await page
      .getByLabel("Read-only JSON source", { exact: true })
      .textContent();
    if (source !== fs.readFileSync("tests/fixtures/json/basic.json", "utf8"))
      throw new Error("Raw source changed");
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await page.getByRole("tree").waitFor();
    await page.getByRole("button", { name: "Tree", exact: true }).click();
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await go("/missing");
    await page.getByText("Path not found", { exact: true }).waitFor();
    await open("big-number.json");
    await page.getByRole("tree").waitFor();
    await page
      .getByRole("treeitem")
      .filter({ hasText: "9223372036854775807" })
      .waitFor();
    await page
      .getByRole("treeitem")
      .filter({ hasText: "12345678901234567890.123456789" })
      .waitFor();
    await open("duplicate-keys.json");
    await page.getByRole("tree").waitFor();
    await page.getByText(/Duplicate keys detected/).waitFor();
    if (
      (await page
        .getByRole("treeitem")
        .filter({ hasText: /name.*Prism/ })
        .count()) !== 2
    )
      throw new Error("Duplicate members lost");
    await open("invalid.json");
    await page.getByRole("heading", { name: "Invalid JSON" }).waitFor();
    if (
      (await page.getByLabel("Read-only JSON source").textContent()) !==
      fs.readFileSync("tests/fixtures/json/invalid.json", "utf8")
    )
      throw new Error("Invalid source unavailable");
    await page.getByRole("button", { name: "Jump to error" }).click();
    await open("unsafe.json");
    await page.getByRole("tree").waitFor();
    if (await page.getByRole("tree").locator("script,img,a,iframe").count())
      throw new Error("Data rendered as executable markup");
    for (const name of [
      "array-root.json",
      "primitives.json",
      "unicode.json",
      "deep.json",
      "geo.json",
      "sample.geojson",
      "long-string.json",
    ]) {
      const started = Date.now();
      await open(name);
      await page.getByRole("tree").waitFor();
      fixtures.push({ name, elapsedMs: Date.now() - started });
    }
    await open("unicode.json");
    await page.getByRole("tree").waitFor();
    await go("/a~1b/~0key");
    await page
      .getByRole("treeitem", { selected: true })
      .filter({ hasText: "escaped" })
      .waitFor();
    await open("empty.json");
    await page.getByRole("heading", { name: "Empty JSON document" }).waitFor();
    await open("sample.jsonl");
    await page.getByRole("heading", { name: "JSON Lines preview" }).waitFor();
    await page.evaluate(() => {
      window.qaGaps = [];
      let last = performance.now();
      window.qaTimer = setInterval(() => {
        const now = performance.now();
        window.qaGaps.push(now - last);
        last = now;
      }, 25);
    });
    const largeStart = Date.now();
    await open("large.json");
    await page.getByRole("tree").waitFor();
    const largeOpenMs = Date.now() - largeStart;
    const initialRows = await page.getByRole("treeitem").count();
    if (initialRows > 80) throw new Error("Large tree not virtualized");
    await page.getByText("Node actions", { exact: true }).click();
    if (
      !(await page
        .getByRole("button", { name: "Expand all", exact: true })
        .isDisabled())
    )
      throw new Error("Expand all not guarded");
    await page.getByText("Node actions", { exact: true }).click();
    await go("/9999/email");
    await page
      .getByRole("treeitem", { selected: true })
      .filter({ hasText: "user9999@example.test" })
      .waitFor();
    const tree = page.getByRole("tree");
    const treeTop = await tree.evaluate((n) => n.scrollTop);
    if (treeTop < 100000) throw new Error("Offscreen navigation failed");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByLabel("Search scope").selectOption("values");
    const searchStart = Date.now();
    await page
      .getByLabel("Search JSON", { exact: true })
      .fill("user8888@example.test");
    await page
      .getByRole("button", { name: "/8888/email", exact: true })
      .waitFor();
    const searchMs = Date.now() - searchStart;
    await page
      .getByRole("button", { name: "/8888/email", exact: true })
      .click();
    await page
      .getByRole("treeitem", { selected: true })
      .filter({ hasText: "user8888@example.test" })
      .waitFor();
    await page.getByLabel("Search scope").selectOption("keys");
    await page.getByLabel("Search JSON", { exact: true }).fill("email");
    await page
      .getByText("Showing first 500 matches", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const restoredTop = await tree.evaluate((n) => n.scrollTop);
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page
      .getByLabel("JSON source", { exact: true })
      .evaluate((n) => (n.scrollTop = 0));
    await page.getByRole("button", { name: "Tree", exact: true }).click();
    if (Math.abs((await tree.evaluate((n) => n.scrollTop)) - restoredTop) > 2)
      throw new Error("Tree scroll lost across modes");
    const renderedRows = await page.getByRole("treeitem").count();
    const heartbeatMaxMs = await page.evaluate(() => {
      clearInterval(window.qaTimer);
      return Math.max(...window.qaGaps);
    });
    await page.getByRole("tree").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    const resize = [];
    for (const width of [1920, 1440, 1024, 900]) {
      await page.setViewportSize({ width, height: 1080 });
      resize.push({
        width,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await open("basic.json");
    await page.getByRole("tree").waitFor();
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await page.screenshot({
      path: "docs/qa/screenshots/module-05-light.png",
      animations: "disabled",
    });
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.screenshot({
      path: "docs/qa/screenshots/module-05-dark.png",
      animations: "disabled",
    });
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "huge.json",
        mimeType: "application/json",
        buffer: Buffer.alloc(9 * 1024 * 1024, 32),
      });
    await page.getByRole("heading", { name: "Large JSON preview" }).waitFor();
    const boundedSourceChars = (
      await page.getByLabel("Read-only JSON source").textContent()
    ).length;
    if (boundedSourceChars > 256 * 1024)
      throw new Error("Unbounded huge source");
    const workerRequests = requests.filter((url) =>
      /json\.worker|json.worker/.test(url),
    );
    if (!workerRequests.length)
      throw new Error("Large parsing did not use worker");
    const report = {
      jsonAtStartup,
      fixtures,
      large: {
        nodes: 90001,
        largeOpenMs,
        searchMs,
        initialRows,
        renderedRows,
        heartbeatMaxMs,
      },
      resize,
      workerRequests,
      boundedSourceChars,
      sourceExact: true,
      precisionExact: true,
      duplicatesRetained: true,
      invalidSource: true,
      scrollRestored: true,
      errors,
      dialogs,
    };
    fs.writeFileSync(
      `docs/qa/module-05-${process.env.PRISM_QA_URL ? "production" : "browser"}-results.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (
      errors.length ||
      dialogs.length ||
      jsonAtStartup.length ||
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
