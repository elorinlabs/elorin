const { chromium } = require(process.env.PRISM_PLAYWRIGHT);
const fs = require("node:fs");
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true });
  const c = await b.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const p = await c.newPage({ viewport: { width: 1440, height: 1000 } });
  const result = { checks: [], errors: [] };
  p.on("pageerror", (e) => result.errors.push(e.message));
  const check = (n, v) => {
    result.checks.push({ name: n, pass: !!v });
    if (!v) throw Error(n);
  };
  await p.goto("http://127.0.0.1:1420");
  const menu = async (target, label) => {
    await target.click({ button: "right", position: { x: 20, y: 20 } });
    check(
      label + " has Prism menu",
      await p.getByRole("menu", { name: "Prism actions" }).isVisible(),
    );
    await p.keyboard.press("Escape");
  };
  await menu(p.locator(".sidebar"), "Sidebar");
  await menu(p.locator(".global-bar"), "Empty shell");
  for (const [file, selector] of [
    ["markdown/basic.md", ".markdown-reader-pane"],
    ["json/basic.json", ".json-tree-pane"],
    ["csv/basic.csv", ".csv-grid"],
    ["text/basic.txt", ".text-viewport"],
    ["image/basic.png", ".image-viewer"],
    ["documents/basic.pdf", ".pdf-viewport"],
  ]) {
    await p.locator("input[type=file]").setInputFiles("tests/fixtures/" + file);
    await p.locator(selector).first().waitFor();
    await menu(p.locator(selector).first(), file);
    check(
      file + " has no outer scroll",
      await p
        .locator("main")
        .evaluate((e) => e.scrollHeight === e.clientHeight),
    );
  }
  await p.locator(".pdf-page[data-rendered=true]").first().waitFor();
  const selected = await p.evaluate(() => {
    const span = document.querySelector(".textLayer span");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  await p
    .locator(".pdf-viewport")
    .click({ button: "right", position: { x: 250, y: 100 } });
  check(
    "right click preserves PDF selection",
    (await p.evaluate(() => getSelection().toString())) === selected,
  );
  await p.getByRole("menuitem", { name: "Copy", exact: true }).click();
  check(
    "PDF selection copies through Prism menu",
    (await p.evaluate(() => navigator.clipboard.readText())) === selected,
  );
  await p.mouse.click(1430, 990, { button: "right" });
  check(
    "menu clamps to viewport",
    await p.getByRole("menu").evaluate((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.right <= innerWidth &&
        r.bottom <= innerHeight &&
        r.left >= 0 &&
        r.top >= 0
      );
    }),
  );
  await p.keyboard.press("Escape");
  await p.setViewportSize({ width: 900, height: 650 });
  check(
    "collapse control fits minimum window",
    await p
      .getByRole("button", { name: /Collapse sidebar|Expand sidebar/ })
      .evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.bottom <= innerHeight && r.top >= 38;
      }),
  );
  fs.writeFileSync(
    "docs/qa/foundation-interaction-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
