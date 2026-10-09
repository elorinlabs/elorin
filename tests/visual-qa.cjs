// Optional browser QA: uses the bundled Playwright runtime via PRISM_PLAYWRIGHT.
const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync("docs/qa/screenshots", { recursive: true });
  const results = [];
  for (const width of [1920, 1440, 1024, 900]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("http://127.0.0.1:1420");
    await page.getByText("Design Guidelines.pdf", { exact: true }).waitFor();
    await page.screenshot({
      path: `docs/qa/screenshots/home-${width}.png`,
      fullPage: true,
    });
    results.push({
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      sidebarCollapsed: await page
        .locator(".sidebar")
        .evaluate((e) => e.classList.contains("collapsed")),
    });
  }
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.getByRole("heading", { name: "Code", exact: true }).waitFor();
  await page.keyboard.press("Control+k");
  const searchFocused = await page
    .getByRole("textbox")
    .evaluate((e) => document.activeElement === e);
  await page.keyboard.press("Escape");
  const escapeBlurred = await page
    .getByRole("textbox")
    .evaluate((e) => document.activeElement !== e);
  const report = { results, errors, searchFocused, escapeBlurred };
  fs.writeFileSync(
    "docs/qa/browser-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (
    errors.length ||
    results.some((r) => r.overflow) ||
    !searchFocused ||
    !escapeBlurred
  )
    process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
