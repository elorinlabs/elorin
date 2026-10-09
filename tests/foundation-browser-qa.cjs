const { chromium } = require(process.env.PRISM_PLAYWRIGHT);
const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const native = process.env.PRISM_NATIVE === "1";
  const browser = native
    ? await chromium.connectOverCDP("http://127.0.0.1:9223")
    : await chromium.launch({ channel: "msedge", headless: true });
  const page = native
    ? browser.contexts()[0].pages()[0]
    : await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const results = {
    runtime: native ? "Tauri WebView2" : "Edge",
    checks: [],
    errors: [],
  };
  page.on("pageerror", (e) => results.errors.push(e.message));
  const check = (name, value) => {
    results.checks.push({ name, pass: !!value });
    if (!value) throw Error(name);
  };
  await page.goto("http://127.0.0.1:1420");
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/documents/basic.pdf");
  await page.locator(".pdf-page canvas").first().waitFor();
  await page.waitForTimeout(800);
  check(
    "custom titlebar visible",
    await page.locator(".prism-titlebar").isVisible(),
  );
  check(
    "PDF mode row removed",
    (await page.locator(".viewer-modes").count()) === 0,
  );
  check(
    "single compact viewer header",
    (await page.locator(".viewer-header").count()) === 1,
  );
  check(
    "PDF bottom status",
    await page
      .locator(".document-toolbar")
      .evaluate(
        (e) =>
          e.getBoundingClientRect().top >
          document.querySelector(".pdf-viewport").getBoundingClientRect().top,
      ),
  );
  check(
    "outer document and shell cannot scroll",
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight === innerHeight &&
        document.querySelector("main").scrollHeight ===
          document.querySelector("main").clientHeight,
    ),
  );
  check(
    "thin themed scrollbar",
    await page
      .locator(".pdf-viewport")
      .evaluate(
        (e) => getComputedStyle(e, "::-webkit-scrollbar").width === "8px",
      ),
  );
  await page
    .locator(".pdf-viewport")
    .click({ button: "right", position: { x: 300, y: 180 } });
  check(
    "Prism context menu",
    await page.getByRole("menu", { name: "Prism actions" }).isVisible(),
  );
  check(
    "PDF zoom actions registered",
    await page.getByRole("menuitem", { name: "Zoom in" }).isVisible(),
  );
  await page.screenshot({
    path: `docs/qa/foundation-${native ? "native" : "browser"}-dark.png`,
  });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  check("Escape dismisses menu", (await page.getByRole("menu").count()) === 0);
  await page.locator(".viewer-more summary").click();
  await page.getByRole("button", { name: "Single page", exact: true }).click();
  check(
    "PDF mode survives menu move",
    (await page.locator(".pdf-page").count()) === 1,
  );
  await page.getByRole("button", { name: "Continuous", exact: true }).click();
  await page.locator(".viewer-more summary").click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("textbox", { name: "Search PDF" }).fill("Needle");
  await page.waitForTimeout(800);
  check(
    "search remains functional",
    await page.locator(".document-search").isVisible(),
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.screenshot({
    path: `docs/qa/foundation-${native ? "native" : "browser"}-light.png`,
  });
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  check(
    "light/dark switch survives",
    (await page.locator("html").getAttribute("data-theme")) === "dark",
  );
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await page.reload();
  check(
    "sidebar state persists",
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  fs.writeFileSync(
    `docs/qa/foundation-${native ? "native" : "browser"}-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
