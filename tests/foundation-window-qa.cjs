const { chromium } = require(process.env.PRISM_PLAYWRIGHT);
const fs = require("node:fs");
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const p = b.contexts()[0].pages()[0];
  const results = { runtime: "Tauri debug window", checks: [], errors: [] };
  p.on("pageerror", (e) => results.errors.push(e.message));
  await p.reload();
  await p
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/documents/basic.pdf");
  await p.locator(".pdf-page[data-rendered=true]").first().waitFor();
  const state = () =>
    p.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke("plugin:window|is_maximized", {
        label: "main",
      }),
    );
  if (await state())
    await p.getByLabel("Restore window", { exact: true }).click();
  await p.getByLabel("Maximize window", { exact: true }).click();
  await p.waitForTimeout(500);
  if (!(await state())) throw Error("Maximize failed");
  results.checks.push("Window control maximizes real HWND");
  await p.getByLabel("Restore window", { exact: true }).click();
  await p.waitForTimeout(500);
  if (await state()) throw Error("Restore failed");
  results.checks.push("Window control restores real HWND");
  await p
    .locator(".titlebar-drag")
    .dispatchEvent("mousedown", { button: 0, detail: 2 });
  await p.waitForTimeout(500);
  if (!(await state())) throw Error("Double click handler failed");
  results.checks.push("Titlebar double-click handler toggles real HWND");
  await p.getByLabel("Restore window", { exact: true }).click();
  await p.waitForTimeout(500);
  await p.locator(".viewer-more summary").click();
  await p
    .locator(".viewer-more")
    .getByRole("button", { name: "Fullscreen", exact: true })
    .click();
  await p.waitForTimeout(400);
  if (!(await p.evaluate(() => !!document.fullscreenElement)))
    throw Error("Fullscreen failed");
  if (await p.locator(".prism-titlebar").isVisible())
    throw Error("Titlebar visible in fullscreen");
  results.checks.push("Fullscreen hides titlebar");
  await p.evaluate(() => document.exitFullscreen());
  await p.waitForTimeout(400);
  if (!(await p.locator(".prism-titlebar").isVisible()))
    throw Error("Titlebar did not return");
  results.checks.push("Fullscreen exit restores titlebar");
  await p.locator(".viewer-more summary").click();
  await p
    .locator(".pdf-viewport")
    .click({ button: "right", position: { x: 300, y: 180 } });
  await p.screenshot({ path: "docs/qa/foundation-native-dark.png" });
  await p.keyboard.press("Escape");
  fs.writeFileSync(
    "docs/qa/foundation-window-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
