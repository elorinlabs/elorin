// Actual WebView2 runtime smoke test; native disk range reads are separately exercised by Rust tests.
const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0],
    results = {
      runtime: "Tauri dev / WebView2",
      source: "Browser File input inside Tauri runtime",
      fixtures: [],
      errors: [],
    };
  page.on("pageerror", (error) => results.errors.push(error.message));
  for (const [name, profile] of [
    ["basic.txt", "Plain"],
    ["unicode.txt", "Plain"],
    ["utf8-bom.txt", "Plain"],
    ["mixed-line-endings.txt", "Plain"],
    ["example.ts", "Code"],
    ["example.py", "Code"],
    ["Dockerfile", "Code"],
    ["basic.log", "Log"],
    ["long-line.txt", "Plain"],
    ["generated-100.log", "Log"],
  ]) {
    const start = performance.now();
    const cdp = await page.context().newCDPSession(page);
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "input[type=file]",
    });
    await cdp.send("DOM.setFileInputFiles", {
      nodeId,
      files: [path.resolve("tests/fixtures/text/" + name)],
    });
    await cdp.detach();
    await page
      .locator(".viewer-file-heading strong")
      .filter({ hasText: name })
      .waitFor();
    await page.waitForFunction(
      (profile) =>
        document.querySelector(".text-viewer")?.dataset.profile === profile &&
        document.querySelector(".text-line-source")?.textContent?.length,
      profile,
    );
    const firstVisibleMs = Math.round(performance.now() - start);
    await page.waitForFunction(
      () => !document.querySelector(".text-progress"),
      null,
      { timeout: 180000 },
    );
    if ((await page.locator(".text-row").count()) > 100)
      throw Error("Unbounded DOM");
    results.fixtures.push({ name, profile, firstVisibleMs });
  }
  await page.keyboard.press("Control+f");
  await page.getByLabel("Search text", { exact: true }).fill("ERROR");
  await page.waitForFunction(() =>
    /[1-9][\d,]* matches/.test(
      document.querySelector(".text-search")?.textContent || "",
    ),
  );
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await page.locator("mark").waitFor();
  await page.keyboard.press("Control+g");
  await page.getByLabel("Line number", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await page.locator('.text-row[data-line="1000"]').waitFor();
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await page.getByLabel("Text inspection").waitFor();
  results.checks = [
    "Actual Tauri shell and worker execution",
    "100 MiB virtualization",
    "Search and next match",
    "Go to line",
    "Text inspection",
  ];
  await page.screenshot({
    path: "docs/qa/screenshots/module-07-tauri.png",
    fullPage: true,
  });
  fs.writeFileSync(
    "docs/qa/module-07-tauri-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
