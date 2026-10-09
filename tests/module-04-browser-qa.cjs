const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    const errors = [], requests = [], dialogs = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", request => requests.push(request.url()));
    page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto(process.env.PRISM_QA_URL || "http://127.0.0.1:1420/");
    await page.getByRole("button", { name: "Open File", exact: true }).waitFor();
    const markdownAtStartup = requests.filter(url => /markdown[/.]|remark-|rehype-|micromark/.test(url));
    await page.locator("input[type=file]").setInputFiles("tests/fixtures/markdown/basic.md");
    await page.getByRole("heading", { name: "Prism", level: 1 }).waitFor();
    const reader = page.getByLabel("Markdown document");
    if (!await reader.getByRole("table").isVisible()) throw new Error("GFM table missing");
    if (!await reader.getByRole("checkbox").first().isDisabled()) throw new Error("Task list is editable");
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    await page.getByRole("navigation", { name: "Document outline" }).getByRole("link", { name: "Code", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".markdown-reader-pane").scrollTop > 0);
    const readingScroll = await page.locator(".markdown-reader-pane").evaluate(node => node.scrollTop);
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByRole("region", { name: "Markdown inspection" }).waitFor();
    if (!await page.getByRole("region", { name: "Markdown inspection" }).getByText("Reading time").isVisible()) throw new Error("Inspection missing");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const exactSource = await page.getByLabel("Read-only Markdown source").textContent();
    if (exactSource !== fs.readFileSync("tests/fixtures/markdown/basic.md", "utf8")) throw new Error("Source changed");
    await page.getByRole("button", { name: "Split", exact: true }).click();
    const splitScroll = await page.locator(".markdown-reader-pane").evaluate(node => ({ top: node.scrollTop, max: node.scrollHeight - node.clientHeight }));
    if (Math.abs(splitScroll.top - Math.min(readingScroll, splitScroll.max)) > 2) throw new Error("Reading scroll not restored");
    await page.getByRole("button", { name: "Read", exact: true }).click();
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    await page.locator(".file-inspector-details > summary").click();
    const resize = [];
    for (const width of [1920, 1440, 1024, 900]) {
      await page.setViewportSize({ width, height: 1080 });
      resize.push({ width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.locator(".markdown-reader-pane").evaluate(node => node.scrollTop = 0);
    fs.mkdirSync("docs/qa/screenshots", { recursive: true });
    await page.screenshot({ path: "docs/qa/screenshots/module-04-light.png", fullPage: true, animations: "disabled" });
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.screenshot({ path: "docs/qa/screenshots/module-04-dark.png", fullPage: true, animations: "disabled" });
    const dark = await reader.evaluate(node => ({ text: getComputedStyle(node).color, background: getComputedStyle(node.closest(".markdown-viewer")).backgroundColor }));
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    const fixtureResults = [];
    for (const name of ["gfm.md", "chinese.md", "links.md", "images.md", "code-blocks.md", "large.md", "empty.md", "malicious.md"]) {
      const start = Date.now();
      await page.locator("input[type=file]").setInputFiles(`tests/fixtures/markdown/${name}`);
      await page.locator(".viewer-file-heading strong").filter({ hasText: name }).waitFor();
      await page.getByLabel("Markdown document").waitFor();
      if (name === "chinese.md") {
        const ids = await reader.locator("h1,h2,h3,h4,h5,h6").evaluateAll(nodes => nodes.map(node => node.id));
        if (new Set(ids).size !== ids.length) throw new Error("Duplicate heading anchors");
      }
      if (name === "images.md") {
        await page.locator(".markdown-image-unavailable").filter({ hasText: "Image unavailable" }).first().waitFor();
        if (await reader.locator("img").count()) throw new Error("Browser images should require resource grants");
      }
      if (name === "empty.md") await page.getByText("Empty Markdown document").waitFor();
      if (name === "malicious.md" && await reader.locator("script,iframe,img[onerror],a[href^='javascript:'],a[href^='data:']").count()) throw new Error("Executable content rendered");
      fixtureResults.push({ name, elapsedMs: Date.now() - start });
    }
    await page.locator("input[type=file]").setInputFiles({ name: "huge.md", mimeType: "text/markdown", buffer: Buffer.alloc(3 * 1024 * 1024, 120) });
    await page.getByRole("alert").filter({ hasText: "Reading View supports Markdown up to 2 MiB" }).waitFor();
    await page.getByRole("button", { name: "Open as Text", exact: true }).click();
    await page.getByLabel("Read-only text").waitFor();
    const report = { markdownAtStartup, resize, dark, fixtureResults, sourceExact: true, scrollRestored: true, hugeFallback: true, dialogs, errors };
    fs.writeFileSync(`docs/qa/module-04-${process.env.PRISM_QA_URL ? "production" : "browser"}-results.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (errors.length || dialogs.length || markdownAtStartup.length || resize.some(item => item.overflow)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
