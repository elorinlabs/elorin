const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const results = {
    fixtures: [],
    performance: [],
    errors: [],
    dialogs: [],
    checks: [],
  };
  try {
    const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage({
      viewport: { width: 1440, height: 1080 },
    });
    page.on("pageerror", (error) => results.errors.push(error.message));
    page.on("dialog", async (dialog) => {
      results.dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.goto(process.env.PRISM_QA_URL || "http://127.0.0.1:1420/");
    const open = async (name, profile) => {
      const start = performance.now();
      await page
        .locator("input[type=file]")
        .setInputFiles("tests/fixtures/text/" + name);
      await page
        .locator(".viewer-file-heading strong")
        .filter({ hasText: name })
        .waitFor();
      await page.getByLabel("Read-only text", { exact: true }).waitFor();
      await page.waitForFunction(
        (profile) =>
          document.querySelector(".text-viewer")?.dataset.profile === profile &&
          document.querySelector(".text-line-source")?.textContent?.length > 0,
        profile,
      );
      results.fixtures.push({
        name,
        profile,
        firstVisibleMs: Math.round(performance.now() - start),
      });
      return performance.now() - start;
    };
    const inspect = async () => {
      await page.getByRole("button", { name: "Inspect", exact: true }).click();
      await page.getByLabel("Text inspection").waitFor();
    };
    const search = async (query) => {
      await page.keyboard.press("Control+f");
      await page.getByLabel("Search text", { exact: true }).fill(query);
    };
    await open("basic.txt", "Plain");
    if (!(await page.getByLabel("Wrap lines").isChecked()))
      throw Error("Plain default wrap");
    await page.locator(".text-line-source").first().click();
    await page.getByRole("button", { name: "Copy line", exact: true }).click();
    await page.getByText("Line copied.", { exact: true }).waitFor();
    if (
      (await page.evaluate(() => navigator.clipboard.readText())) !==
      "Prism text engine"
    )
      throw Error("Copy line mismatch");
    results.checks.push("Copy line preserves exact text");
    await inspect();
    await page
      .getByRole("button", { name: "File details", exact: true })
      .click();
    if (
      !(await page.getByLabel("Text inspection").textContent()).includes(
        "Encoding",
      )
    )
      throw Error("File inspection");
    for (const [name, profile] of [
      ["unicode.txt", "Plain"],
      ["utf8-bom.txt", "Plain"],
      ["mixed-line-endings.txt", "Plain"],
      ["example.ts", "Code"],
      ["example.py", "Code"],
      ["example.rs", "Code"],
      ["example.go", "Code"],
      ["example.cpp", "Code"],
      ["Dockerfile", "Code"],
      ["Makefile", "Code"],
      ["no-extension-script", "Code"],
      [".env", "Config"],
      ["unknown.custom", "Plain"],
      ["basic.log", "Log"],
      ["mixed-levels.log", "Log"],
      ["timestamp.log", "Log"],
    ]) {
      await open(name, profile);
      if (profile === "Code") {
        await page
          .locator('.text-line-source [class^="hljs-"]')
          .first()
          .waitFor();
      }
      if (name === "mixed-line-endings.txt") {
        await inspect();
        if (
          !(await page.getByLabel("Text inspection").textContent()).includes(
            "Mixed",
          )
        )
          throw Error("Mixed endings");
      }
    }
    await open("unsafe.txt", "Plain");
    if (
      await page
        .locator(".text-viewer script,.text-viewer img,.text-viewer a")
        .count()
    )
      throw Error("Unsafe content became executable DOM");
    if (
      !(await page.getByLabel("Read-only text").textContent()).includes(
        "<script>alert(1)</script>",
      )
    )
      throw Error("Unsafe source changed");
    results.checks.push("HTML, script, URLs and ANSI remain inert text");
    await open("ansi.log", "Log");
    await open("long-line.txt", "Plain");
    await page.waitForFunction(
      () => !document.querySelector(".text-progress"),
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: /Very long line/ }).click();
    await page.getByLabel("Long line preview").waitFor();
    const firstPageLength = await page
      .locator(".text-line-page pre")
      .textContent()
      .then((value) => value.length);
    if (firstPageLength > 16384) throw Error("Long line page not bounded");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page
      .getByRole("button", { name: "Close preview", exact: true })
      .click();
    await page.keyboard.press("Control+g");
    await page.getByLabel("Line number", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page
      .getByLabel("Read-only text")
      .getByText("After the very long line", { exact: true })
      .waitFor();
    results.checks.push(
      "5 MiB line preview, paged expansion and subsequent line navigation",
    );
    for (const mb of process.env.PRISM_QA_GB
      ? [1, 20, 100, 500, 1024]
      : [1, 20, 100, 500]) {
      console.log(`Validating ${mb} MiB log`);
      const firstVisibleMs = await open(`generated-${mb}.log`, "Log");
      const indexStart = performance.now();
      await page.waitForFunction(
        () => !document.querySelector(".text-progress"),
        null,
        { timeout: 180000 },
      );
      const indexingMsAfterVisible = Math.round(performance.now() - indexStart);
      const rows = await page.locator(".text-row").count();
      if (rows > 100) throw Error("Too many virtual rows: " + rows);
      const viewport = page.getByLabel("Read-only text", { exact: true });
      const firstLine = await page
        .locator(".text-row")
        .first()
        .getAttribute("data-line");
      const scrollStart = performance.now();
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight * 0.7;
      });
      await page.waitForFunction(
        (firstLine) =>
          document.querySelector(".text-row")?.dataset.line !== firstLine,
        firstLine,
      );
      const scrollMs = Math.round(performance.now() - scrollStart);
      await search("ERROR");
      const searchStart = performance.now();
      await page.waitForFunction(() =>
        /[1-9][\d,]* matches/.test(
          document.querySelector(".text-search")?.textContent || "",
        ),
      );
      const firstMatchMs = Math.round(performance.now() - searchStart);
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".text-search")
            ?.textContent.includes("Searching…"),
        null,
        { timeout: 180000 },
      );
      const searchMs = Math.round(performance.now() - searchStart),
        matches = await page.locator(".text-search").textContent();
      await page
        .getByRole("button", { name: "Next match", exact: true })
        .click();
      await page.locator(".text-viewport mark").waitFor();
      await page.keyboard.press("Control+g");
      await page.getByLabel("Line number", { exact: true }).fill("1000");
      await page.getByRole("button", { name: "Go", exact: true }).click();
      await page.locator('.text-row[data-line="1000"]').waitFor();
      await page
        .locator('.text-row[data-line="1000"] .text-line-source')
        .click();
      await inspect();
      if (
        !(await page.getByLabel("Text inspection").textContent()).includes(
          "LINE 1,000",
        )
      )
        throw Error("Selected-line inspector");
      const memory = await page.evaluate(() =>
        performance.memory
          ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
            }
          : null,
      );
      await page
        .getByRole("button", { name: "Open at end", exact: true })
        .click();
      await page.waitForFunction(() => {
        const text = document.querySelector(".text-status")?.textContent || "",
          total = Number(text.match(/^[\d,]+/)?.[0].replaceAll(",", ""));
        return !!document.querySelector(`.text-row[data-line="${total}"]`);
      });
      results.performance.push({
        mb,
        firstVisibleMs: Math.round(firstVisibleMs),
        indexingMsAfterVisible,
        scrollMs,
        firstMatchMs,
        searchMs,
        rows,
        matches,
        memory,
      });
    }
    await open("generated-10.ts", "Code");
    await page.locator(".hljs-keyword").first().waitFor();
    await search("prism");
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".text-search")
          ?.textContent.includes("Searching…"),
      null,
      { timeout: 60000 },
    );
    results.checks.push("10 MiB source file opens, highlights and searches");
    await open("generated-500.log", "Log");
    await search("timeout");
    await page.getByLabel("Search text").fill("Record");
    await page
      .getByRole("button", { name: "Cancel search", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel indexing", exact: true })
      .click();
    await open("basic.txt", "Plain");
    results.checks.push(
      "Superseded search, explicit cancellation and switching away from 500 MiB file",
    );
    await open("regex-adversarial.txt", "Plain");
    await search("(a+)+$");
    const regexStart = performance.now();
    await page.getByRole("button", { name: "Regex", exact: true }).click();
    await page.getByLabel("Wrap lines").uncheck();
    await page
      .getByText(/Background operation timed out/)
      .waitFor({ timeout: 10000 });
    results.checks.push(
      `Adversarial regex terminated after ${Math.round(performance.now() - regexStart)} ms; wrap control remained responsive`,
    );
    await page
      .getByRole("button", { name: "Close search", exact: true })
      .click();
    for (const [fixture, surface] of [
      ["markdown/basic.md", ".markdown-viewer"],
      ["json/basic.json", ".json-viewer"],
      ["csv/basic.csv", ".csv-viewer"],
    ]) {
      await page
        .locator("input[type=file]")
        .setInputFiles("tests/fixtures/" + fixture);
      await page.locator(surface).waitFor();
    }
    results.checks.push("Markdown, JSON, CSV retain dedicated plugins");
    await open("example.ts", "Code");
    await page.locator(".hljs-keyword").first().waitFor();
    fs.mkdirSync("docs/qa/screenshots", { recursive: true });
    await page.screenshot({
      path: "docs/qa/screenshots/module-07-light.png",
      fullPage: true,
    });
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await page.screenshot({
      path: "docs/qa/screenshots/module-07-dark.png",
      fullPage: true,
    });
    if (results.errors.length || results.dialogs.length)
      throw Error(
        JSON.stringify({ errors: results.errors, dialogs: results.dialogs }),
      );
    fs.writeFileSync(
      process.env.PRISM_QA_RESULT || "docs/qa/module-07-browser-results.json",
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    fs.writeFileSync(
      "docs/qa/module-07-browser-failure.json",
      JSON.stringify({ ...results, failure: error.message }, null, 2),
    );
    throw error;
  } finally {
    await browser.close();
  }
})();
