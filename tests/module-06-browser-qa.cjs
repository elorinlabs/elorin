const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1080 },
      }),
      errors = [],
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
    const csvAtStartup = requests.filter((x) =>
      /csv\.plugin|papaparse|csv.worker/.test(x),
    );
    const open = async (name) => {
      await page
        .locator("input[type=file]")
        .setInputFiles("tests/fixtures/csv/" + name);
      await page
        .locator(".viewer-file-heading strong")
        .filter({ hasText: name })
        .waitFor();
      await page.getByRole("grid").waitFor();
    };
    await open("basic.csv");
    await page.getByRole("gridcell", { name: "Alice", exact: true }).click();
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByLabel("CSV inspection").waitFor();
    if (
      !(await page
        .getByLabel("CSV inspection")
        .textContent()
        .then((x) => x.includes("Alice")))
    )
      throw Error("Cell inspect failed");
    await page.getByRole("button", { name: /^revenue/ }).click();
    if (
      !(await page
        .getByLabel("CSV inspection")
        .textContent()
        .then((x) => x.includes("Mean")))
    )
      throw Error("Column inspect failed");
    await page.getByRole("rowheader", { name: "2", exact: true }).click();
    if (
      !(await page
        .getByLabel("CSV inspection")
        .textContent()
        .then((x) => x.includes("Bob")))
    )
      throw Error("Row inspect failed");
    await page.getByRole("button", { name: "Source", exact: true }).click();
    if (
      (await page.getByLabel("Read-only CSV source").textContent()) !==
      fs.readFileSync("tests/fixtures/csv/basic.csv", "utf8")
    )
      throw Error("Source changed");
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await page.getByRole("grid").waitFor();
    await page.getByLabel("CSV source", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await page.getByLabel("Filter column", { exact: true }).selectOption("4");
    await page
      .getByLabel("Filter operation", { exact: true })
      .selectOption(">");
    await page.getByLabel("Filter value", { exact: true }).fill("1000");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page
      .getByRole("gridcell", { name: "Bob", exact: true })
      .waitFor({ state: "detached" });
    if (
      (await page
        .getByRole("rowheader", { name: "3", exact: true })
        .count()) !== 1
    )
      throw Error("Original row index lost");
    await page.getByRole("button", { name: "Clear view", exact: true }).click();
    await page.getByRole("gridcell", { name: "Bob", exact: true }).waitFor();
    await page.getByRole("button", { name: /^revenue/ }).click();
    await page
      .getByRole("button", { name: "Sort ascending", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("[role=rowheader]")?.textContent === "2",
    );
    for (const name of [
      "quoted.csv",
      "multiline.csv",
      "headerless.csv",
      "duplicate-headers.csv",
      "ragged.csv",
      "unicode.csv",
      "numbers.csv",
      "dates.csv",
      "unsafe.csv",
      "empty.csv",
      "header-only.csv",
      "one-column.csv",
      "basic.tsv",
      "semicolon.csv",
      "pipe.csv",
      "bom.csv",
      "invalid.csv",
      "long-cell.csv",
    ]) {
      const start = Date.now();
      await open(name);
      await page
        .locator(".csv-status")
        .filter({ hasText: "Indexed" })
        .waitFor();
      fixtures.push({ name, openMs: Date.now() - start });
      if (
        name === "headerless.csv" &&
        (await page.getByLabel("First row is header").isChecked())
      )
        throw Error("Headerless detection");
      if (
        name === "quoted.csv" &&
        !(await page.getByRole("grid").textContent()).includes(
          "A viewer, explorer, and analyzer",
        )
      )
        throw Error("Quote parse");
      if (
        name === "unsafe.csv" &&
        (await page.getByRole("grid").locator("script,a,img").count())
      )
        throw Error("Unsafe rendering");
      if (
        name === "numbers.csv" &&
        !(await page.getByRole("grid").textContent()).includes(
          "9223372036854775807",
        )
      )
        throw Error("Precision loss");
      if (name === "multiline.csv") {
        await page.getByRole("gridcell", { name: /Hello/ }).click();
        await page
          .getByRole("button", { name: "Inspect", exact: true })
          .click();
        if (
          !(await page
            .getByLabel("CSV inspection")
            .textContent()
            .then((x) => x.includes("Hello\r\nWorld")))
        )
          throw Error("Multiline cell inspection");
      }
    }
    await open("wide.csv");
    const wideGrid = page.getByRole("grid");
    const wideInitial = await wideGrid.getByRole("columnheader").count();
    await wideGrid.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(100);
    const wideAfter = await wideGrid.getByRole("columnheader").count();
    if (wideInitial > 25 || wideAfter > 25)
      throw Error("Wide header DOM budget");
    const datasets = [];
    for (const name of ["large.csv", "million-local.csv"]) {
      await page.evaluate(() => {
        window.csvHeartbeats = [];
        let last = performance.now();
        window.csvHeartbeat = setInterval(() => {
          const now = performance.now();
          window.csvHeartbeats.push(now - last);
          last = now;
        }, 16);
      });
      const start = Date.now();
      await open(name);
      const firstScreenMs = Date.now() - start,
        firstStatus = await page.locator(".csv-status").textContent();
      await page.waitForFunction(
        () => {
          const el = document.querySelector(".csv-status");
          return el && !el.textContent.includes("Indexing");
        },
        null,
        { timeout: 120000 },
      );
      const indexedMs = Date.now() - start,
        grid = page.getByRole("grid"),
        loadedDataRows = Number(await grid.getAttribute("aria-rowcount")) - 1,
        initialRows = await grid.getByRole("row").count(),
        initialCells = await grid.getByRole("gridcell").count();
      await grid.evaluate((el) => {
        el.scrollTop = 1500000;
        el.scrollLeft = 1400;
      });
      await page.waitForTimeout(150);
      const scrolledRows = await grid.getByRole("row").count(),
        scrolledColumns = await grid.getByRole("columnheader").count();
      if (initialRows > 60 || scrolledRows > 60 || scrolledColumns > 25)
        throw Error("Grid DOM budget");
      if (name === "large.csv" && loadedDataRows !== 100000)
        throw Error("Full 100k row count mismatch");
      await grid.getByRole("gridcell").first().click();
      await grid.press("ArrowRight");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByLabel("Search CSV", { exact: true }).fill("Person 99999");
      const searchStart = Date.now();
      await page
        .getByText("1 matches", { exact: true })
        .waitFor({ timeout: 60000 });
      const searchMs = Date.now() - searchStart;
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("gridcell", { selected: true }).waitFor();
      if (
        !(await page
          .getByRole("gridcell", { selected: true })
          .textContent()
          .then((x) => x.includes("Person 99999")))
      )
        throw Error("Search navigation");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByRole("button", { name: "Filter", exact: true }).click();
      await page.getByLabel("Filter column", { exact: true }).selectOption("2");
      await page.getByLabel("Filter value", { exact: true }).fill("Tokyo");
      const filterStart = Date.now();
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await page.waitForFunction(
        () => {
          const text = document.querySelector(".csv-status")?.textContent;
          return (
            text?.includes("visible rows") && !text.includes("Updating view")
          );
        },
        null,
        { timeout: 60000 },
      );
      const filterMs = Date.now() - filterStart;
      await page.evaluate(() => clearInterval(window.csvHeartbeat));
      const perf = await page.evaluate(() => ({
        maxHeartbeatMs: Math.max(...window.csvHeartbeats),
        heapUsedBytes: performance.memory?.usedJSHeapSize,
        heapLimitBytes: performance.memory?.jsHeapSizeLimit,
      }));
      datasets.push({
        name,
        fileBytes: fs.statSync("tests/fixtures/csv/" + name).size,
        firstScreenMs,
        loadedDataRows,
        firstStatus,
        indexedMs,
        finalStatus: await page.locator(".csv-status").textContent(),
        initialRows,
        initialCells,
        scrolledRows,
        scrolledColumns,
        searchMs,
        filterMs,
        ...perf,
      });
      await page.getByRole("button", { name: "Source", exact: true }).click();
      const sourceChars = (
        await page.getByLabel("Read-only CSV source").textContent()
      ).length;
      if (sourceChars > 262144) throw Error("Unbounded Source");
      // Release the previous dataset and its retained rows before the next performance sample.
      await page.reload();
      await page
        .getByRole("button", { name: "Open File", exact: true })
        .waitFor();
    }
    await open("basic.csv");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByRole("button", { name: /^revenue/ }).click();
    const resize = [];
    for (const width of [1920, 1440, 1024, 900]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.waitForTimeout(100);
      resize.push({
        width,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      });
    }
    if (resize.some((r) => r.overflow)) throw Error("Page overflow");
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await page.screenshot({
      path: "docs/qa/screenshots/module-06-light.png",
      animations: "disabled",
    });
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.screenshot({
      path: "docs/qa/screenshots/module-06-dark.png",
      animations: "disabled",
    });
    if (errors.length || dialogs.length)
      throw Error(JSON.stringify({ errors, dialogs }));
    const result = {
      csvAtStartup,
      fixtures,
      wide: { initialHeaders: wideInitial, scrolledHeaders: wideAfter },
      datasets,
      resize,
      workerRequests: requests.filter((x) => /csv.worker/.test(x)),
      errors,
      dialogs,
    };
    fs.writeFileSync(
      process.env.PRISM_QA_URL
        ? "docs/qa/module-06-production-results.json"
        : "docs/qa/module-06-browser-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
