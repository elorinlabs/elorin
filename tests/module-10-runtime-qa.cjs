const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const native = process.env.PRISM_NATIVE === "1",
    browser = native
      ? await chromium.connectOverCDP("http://127.0.0.1:9223")
      : await chromium.launch({ channel: "msedge", headless: true });
  const context = native
      ? browser.contexts()[0]
      : await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = native ? context.pages()[0] : await context.newPage();
  page.setDefaultTimeout(20000);
  const result = {
    runtime: native ? "Tauri WebView2" : "Edge Browser",
    fixtures: [],
    checks: [],
    errors: [],
    externalRequests: [],
  };
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !/127\.0\.0\.1|localhost/.test(r.url()))
      result.externalRequests.push(r.url());
  });
  page.on("dialog", (d) => d.dismiss());
  const check = (s, v) => {
    assert.ok(v, s);
    result.checks.push(s);
  };
  async function open(folder, name) {
    await page.reload();
    await page.locator("input[type=file]").waitFor({ state: "attached" });
    const start = Date.now(),
      cdp = await context.newCDPSession(page),
      doc = await cdp.send("DOM.getDocument"),
      { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector: "input[type=file]",
      });
    await cdp.send("DOM.setFileInputFiles", {
      nodeId,
      files: [path.resolve(`tests/fixtures/${folder}/${name}`)],
    });
    await cdp.detach();
    await page
      .locator(".viewer-file-heading strong")
      .filter({ hasText: name })
      .waitFor();
    return start;
  }
  async function more(label) {
    const m = page.locator(".viewer-more");
    if ((await m.getAttribute("open")) === null)
      await m.locator("summary").click();
    await m.getByRole("button", { name: label, exact: true }).click();
    if ((await m.getAttribute("open")) !== null)
      await m.locator("summary").click();
  }
  try {
    await page.goto("http://127.0.0.1:1420");
    for (const name of fs.readdirSync("tests/fixtures/spreadsheets")) {
      console.log("Opening", name);
      const start = await open("spreadsheets", name);
      await page
        .locator(".spreadsheet-viewer,.m10-message,.binary-fallback")
        .waitFor({ timeout: 120000 });
      const ms = Date.now() - start;
      const failure = [
          "malformed.xlsx",
          "xxe.xlsx",
          "traversal.xlsx",
          "zip-bomb.xlsx",
        ].includes(name),
        legacy = name === "legacy.xls";
      if (failure || legacy)
        check(
          `${name}: explicit fallback`,
          await page.locator(".m10-message").isVisible(),
        );
      else {
        check(`${name}: grid`, await page.locator(".m10-grid").isVisible());
        const count = await page.locator(".m10-cell").count();
        check(`${name}: bounded rendered cells`, count < 2000);
        if (name === "basic.xlsx") {
          check(
            "identifier preserved",
            (await page.locator("[data-address=A2]").innerText()) ===
              "00012345678901234567890",
          );
          await page.locator("[data-address=A2]").click();
          await page
            .getByRole("button", { name: "Cell details", exact: true })
            .click();
          check(
            "cell inspector",
            await page
              .locator(".m10-inspector")
              .innerText()
              .then((t) => t.includes("00012345678901234567890")),
          );
        }
        if (name === "formulas.xlsx") {
          check(
            "missing formula cache shown",
            (await page.locator("[data-address=B1]").innerText()) ===
              "Result unavailable",
          );
          await page.locator("[data-address=C1]").click();
          check(
            "DDE inert inspect",
            await page
              .locator(".m10-formula")
              .innerText()
              .then((t) => t.includes("cmd|")),
          );
        }
        if (name === "hidden.xlsx") {
          check(
            "hidden tabs omitted",
            (await page.getByRole("tab").count()) === 1,
          );
          await more("Hidden sheets");
          check(
            "hidden sheets available",
            (await page.getByRole("tab").count()) === 3,
          );
          await page
            .getByRole("tab", { name: "Sheet3 (veryHidden)", exact: true })
            .click();
          await page
            .getByRole("gridcell", { name: "Very hidden sheet", exact: true })
            .waitFor();
        }
        if (name === "sparse.xlsx") {
          await page
            .getByLabel("Go to cell", { exact: true })
            .fill("XFD1048576");
          await page.getByLabel("Go to cell", { exact: true }).press("Enter");
          await page.locator("[data-address=XFD1048576]").waitFor();
          check(
            "far edge accessible",
            (await page.locator("[data-address=XFD1048576]").innerText()) ===
              "Far edge",
          );
        }
        if (name === "large.xlsx" || name === "large-1m.xlsx") {
          const last = name === "large.xlsx" ? "A100000" : "A1000000";
          await page.getByLabel("Go to cell", { exact: true }).fill(last);
          await page.getByLabel("Go to cell", { exact: true }).press("Enter");
          await page.locator(`[data-address=${last}]`).waitFor();
          check(
            `${name}: last cell value`,
            (await page.locator(`[data-address=${last}]`).innerText()) ===
              last.slice(1),
          );
        }
        if (name === "freeze-panes.xlsx") {
          await page.locator(".m10-grid").evaluate((e) => {
            e.scrollTop = 2000;
            e.scrollLeft = 100;
          });
          await page.waitForTimeout(100);
          check(
            "frozen first cell retained",
            await page.locator("[data-address=A1]").isVisible(),
          );
        }
        if (name === "charts.xlsx") {
          await page
            .getByRole("button", { name: "Cell details", exact: true })
            .click();
          check(
            "chart explicit placeholder",
            await page
              .locator(".m10-placeholder")
              .innerText()
              .then((t) => t.includes("Quarterly sales")),
          );
        }
        if (name === "images.xlsx") {
          await page
            .getByRole("button", { name: "Cell details", exact: true })
            .click();
          check(
            "worksheet image decoded",
            await page
              .locator(".m10-embedded-image")
              .evaluate((e) => e.complete && e.naturalWidth > 0),
          );
        }
        if (name === "many-sheets.xlsx") {
          await page
            .getByRole("button", { name: "Search", exact: true })
            .click();
          await page.getByLabel("Search workbook").fill("Sheet 50");
          await page.getByLabel("Search scope").selectOption("all");
          await page.getByRole("button", { name: "Find", exact: true }).click();
          await page
            .locator(".m10-results button")
            .filter({ hasText: "Sheet50!A1" })
            .waitFor();
          await page
            .locator(".m10-results button")
            .filter({ hasText: "Sheet50!A1" })
            .click();
          await page
            .getByRole("tab", { name: "Sheet50", exact: true })
            .waitFor();
          check(
            "workbook search and switch",
            (await page.locator("[data-address=A1]").innerText()) ===
              "Sheet 50",
          );
        }
      }
      result.fixtures.push({
        name,
        firstContentMs: ms,
        renderedCells: await page.locator(".m10-cell").count(),
        heap: await page.evaluate(
          () => performance.memory?.usedJSHeapSize ?? null,
        ),
      });
    }
    for (const name of fs.readdirSync("tests/fixtures/presentations")) {
      console.log("Opening", name);
      const start = await open("presentations", name);
      await page
        .locator(".presentation-viewer,.m10-message")
        .waitFor({ timeout: 120000 });
      const ms = Date.now() - start;
      if (["malformed.pptx", "legacy.ppt"].includes(name))
        check(
          `${name}: explicit fallback`,
          await page.locator(".m10-message").isVisible(),
        );
      else {
        check(
          `${name}: slide canvas`,
          await page.locator(".m10-stage .m10-slide").isVisible(),
        );
        if (name === "basic.pptx") {
          await page.getByRole("button", { name: "Next", exact: true }).click();
          await page
            .locator(".m10-stage")
            .filter({ hasText: "Second slide" })
            .waitFor();
          check(
            "slide navigation",
            (await page.getByLabel("Slide number").inputValue()) === "2",
          );
        }
        if (name === "images.pptx")
          check(
            "slide image decoded",
            await page
              .locator(".m10-stage img")
              .evaluate((e) => e.complete && e.naturalWidth > 0),
          );
        if (name === "tables.pptx")
          check(
            "table content visible",
            await page
              .locator(".m10-stage table")
              .innerText()
              .then((t) => t.includes("Product") && t.includes("42")),
          );
        if (name === "charts.pptx")
          check(
            "chart placeholder visible",
            await page
              .locator(".m10-stage .m10-placeholder")
              .innerText()
              .then((t) => t.includes("Quarterly sales")),
          );
        if (name === "notes.pptx") {
          await page
            .getByRole("button", { name: "Notes", exact: true })
            .click();
          check(
            "notes visible",
            await page
              .locator(".m10-notes")
              .innerText()
              .then((t) => t.includes("Private speaker note")),
          );
          await page
            .getByRole("button", { name: "Search", exact: true })
            .click();
          await page.getByLabel("Search presentation").fill("needle");
          await page.getByLabel("Include notes", { exact: true }).check();
          await page.getByRole("button", { name: "Find", exact: true }).click();
          await page.locator(".m10-results button").waitFor();
          check("notes search", true);
        }
        if (name === "links.pptx") {
          await page
            .locator(".m10-stage button")
            .filter({ hasText: "Go to second slide" })
            .click();
          await page
            .locator(".m10-stage")
            .filter({ hasText: "Destination" })
            .waitFor();
          check(
            "internal slide hyperlink",
            (await page.getByLabel("Slide number").inputValue()) === "2",
          );
        }
        if (name === "many-slides.pptx") {
          await page
            .getByRole("button", { name: "Thumbnails", exact: true })
            .click();
          check(
            "thumbnail rail virtualized",
            (await page.locator(".m10-rail button").count()) <= 10,
          );
          await page.getByLabel("Slide number").fill("1000");
          await page.getByLabel("Slide number").press("Enter");
          await page
            .locator(".m10-stage")
            .filter({ hasText: "Slide 1000" })
            .waitFor();
          check("1000th slide accessible", true);
        }
        if (name === "remote-image.pptx")
          check(
            "remote image visibly blocked",
            await page
              .locator(".m10-stage .m10-placeholder")
              .innerText()
              .then((t) => t.includes("blocked")),
          );
      }
      result.fixtures.push({ name, firstContentMs: ms });
    }
    await open("spreadsheets", "formats.xlsx");
    await page.locator(".m10-grid").waitFor();
    await page.screenshot({
      path: `docs/qa/module-10-${native ? "tauri" : "browser"}-spreadsheet.png`,
    });
    await open("presentations", "basic.pptx");
    await page.locator(".m10-stage").waitFor();
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    check(
      "presentation fullscreen entered",
      await page.evaluate(() => !!document.fullscreenElement),
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    if (await page.evaluate(() => !!document.fullscreenElement))
      await page.evaluate(() => document.exitFullscreen());
    check(
      "presentation fullscreen exited",
      await page.evaluate(() => !document.fullscreenElement),
    );
    const ratio = await page
      .locator(".m10-stage .m10-slide")
      .evaluate((e) => e.clientWidth / e.clientHeight);
    check("slide aspect ratio preserved", Math.abs(ratio - 16 / 9) < 0.02);
    await page.screenshot({
      path: `docs/qa/module-10-${native ? "tauri" : "browser"}-presentation.png`,
    });
    check("no external requests", result.externalRequests.length === 0);
    check("no runtime exceptions", result.errors.length === 0);
  } catch (e) {
    result.failure = e.stack;
    process.exitCode = 1;
    await page
      .screenshot({
        path: `docs/qa/module-10-${native ? "tauri" : "browser"}-failure.png`,
      })
      .catch(() => {});
  } finally {
    fs.writeFileSync(
      `docs/qa/module-10-${native ? "tauri" : "browser"}-results.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
  }
})();
