const { chromium } = require(process.env.PRISM_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" }),
    context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    page = await context.newPage({ viewport: { width: 1440, height: 1080 } });
  const result = {
    fixtures: [],
    checks: [],
    errors: [],
    dialogs: [],
    externalRequests: [],
  };
  await page.addInitScript(() => {
    const live = {
      bitmaps: new Set(),
      urls: new Set(),
      workers: new Set(),
      decoders: new Set(),
      frames: new Set(),
    };
    window.prismImageLive = live;
    const bitmap = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      const value = await bitmap(...args),
        close = value.close.bind(value);
      live.bitmaps.add(value);
      value.close = () => {
        live.bitmaps.delete(value);
        close();
      };
      return value;
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      live.urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      live.urls.delete(url);
      revoke(url);
    };
    const WorkerBase = window.Worker;
    window.Worker = class extends WorkerBase {
      constructor(...args) {
        super(...args);
        live.workers.add(this);
      }
      terminate() {
        live.workers.delete(this);
        super.terminate();
      }
    };
    if (window.VideoFrame) {
      const close = VideoFrame.prototype.close;
      VideoFrame.prototype.close = function () {
        live.frames.delete(this);
        close.call(this);
      };
    }
    if (window.ImageDecoder) {
      const Base = window.ImageDecoder;
      window.ImageDecoder = class extends Base {
        constructor(...args) {
          super(...args);
          live.decoders.add(this);
        }
        async decode(...args) {
          const result = await super.decode(...args);
          live.frames.add(result.image);
          return result;
        }
        close() {
          live.decoders.delete(this);
          super.close();
        }
      };
    }
  });
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("dialog", async (d) => {
    result.dialogs.push(d.message());
    await d.dismiss();
  });
  page.on("request", (r) => {
    if (r.url().includes("example.invalid"))
      result.externalRequests.push(r.url());
  });
  try {
    await page.goto(process.env.PRISM_QA_URL || "http://127.0.0.1:1420/");
    async function open(name, expectedError = false) {
      const start = performance.now();
      await page
        .locator("input[type=file]")
        .setInputFiles("tests/fixtures/image/" + name);
      await page
        .locator(".viewer-file-heading strong")
        .filter({ hasText: name })
        .waitFor();
      await page.getByLabel("Image viewer", { exact: true }).waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector(".image-error") ||
          document.querySelector(".image-viewer canvas")?.width > 0,
      );
      const error = await page.locator(".image-error").count();
      if (Boolean(error) !== expectedError)
        throw Error(
          name + ": " + (await page.locator(".image-viewer").innerText()),
        );
      const data = await page
        .locator(".image-viewer canvas")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            width: n.width,
            height: n.height,
            style: n.getAttribute("style"),
          })),
        );
      result.fixtures.push({
        name,
        firstVisibleMs: Math.round(performance.now() - start),
        error: Boolean(error),
        canvas: data,
      });
    }
    for (const name of [
      "basic.png",
      "photo.jpg",
      "transparent.png",
      "basic.webp",
      "basic.bmp",
      "icon.ico",
      "高 DPI 图片.png",
      "cmyk.jpg",
      "profile.jpg",
      "first-page.tiff",
      "basic.avif",
    ])
      if (fs.existsSync("tests/fixtures/image/" + name)) await open(name);
    for (let orientation = 1; orientation <= 8; orientation++) {
      await open(`orientation-${orientation}.jpg`);
      const dims = await page
        .locator(".image-viewer canvas")
        .evaluate((n) => [n.width, n.height]);
      if (dims.join() !== (orientation >= 5 ? "80,160" : "160,80"))
        throw Error("EXIF display dimensions " + orientation);
      const sample = await page
        .locator(".image-viewer canvas")
        .evaluate((n) =>
          Array.from(n.getContext("2d").getImageData(10, 10, 1, 1).data),
        );
      result.checks.push({ orientation, topLeft: sample });
    }
    await open("metadata.jpg");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByLabel("Image inspection").waitFor();
    if (await page.getByText("Latitude: 31.2", { exact: true }).isVisible())
      throw Error("GPS visible by default");
    await page.getByText("Location metadata", { exact: true }).click();
    await page.getByText("Latitude: 31.2", { exact: true }).waitFor();
    result.checks.push("GPS initially collapsed and explicitly expands");
    for (const name of ["animated.gif", "animated.webp", "animated.png"]) {
      await open(name);
      await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
      const sample = () =>
        page
          .locator(".image-viewer canvas")
          .evaluate((n) =>
            Array.from(n.getContext("2d").getImageData(0, 0, 1, 1).data).join(),
          );
      const first = await sample();
      await page.waitForTimeout(190);
      const second = await sample();
      if (first === second) throw Error(name + " did not animate");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.waitForTimeout(50);
      const paused = await sample();
      await page.waitForTimeout(400);
      if (paused !== (await sample())) throw Error(name + " pause failed");
      await page
        .getByRole("navigation", { name: "Opened files" })
        .getByRole("button", { name: "photo.jpg", exact: true })
        .click();
      await page.getByLabel("Image viewer", { exact: true }).waitFor();
      await page
        .getByRole("navigation", { name: "Opened files" })
        .getByRole("button", { name, exact: true })
        .click();
      await page.getByRole("button", { name: "Play", exact: true }).waitFor();
      await page.waitForFunction((value) => {
        const n = document.querySelector(".image-viewer canvas");
        return (
          n &&
          Array.from(
            n.getContext("2d").getImageData(0, 0, 1, 1).data,
          ).join() === value
        );
      }, paused);
      result.checks.push(name + " paused frame survives switching files");
      await page.getByRole("button", { name: "Play", exact: true }).click();
      result.checks.push(name + " changes frames, pauses and resumes");
    }
    await open("finite.gif");
    await page.getByRole("button", { name: "Play", exact: true }).waitFor();
    const finalColor = await page
      .locator(".image-viewer canvas")
      .evaluate((n) =>
        Array.from(n.getContext("2d").getImageData(0, 0, 1, 1).data),
      );
    if (finalColor[2] !== 255)
      throw Error("Finite animation did not retain its final frame");
    result.checks.push("Finite GIF stops after its specified loop count");
    await open("basic.svg");
    await page.getByAltText("Sanitized SVG preview").waitFor();
    await open("unsafe.svg");
    await page.getByAltText("Sanitized SVG preview").waitFor();
    if (result.externalRequests.length || result.dialogs.length)
      throw Error("SVG escaped isolation");
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByLabel("Read-only text", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Default viewer", exact: true })
      .click();
    await page.getByAltText("Sanitized SVG preview").waitFor();
    result.checks.push(
      "SVG Source renders escaped text and returns to vector preview",
    );
    await open("malformed.svg", true);
    await open("damaged.png", true);
    await open("unsupported.heic", true);
    if (fs.existsSync("tests/fixtures/image/generated-example.heic"))
      await open("generated-example.heic", true);
    for (const name of [
      "generated-4k.png",
      "generated-20mp.png",
      "generated-100mp.png",
      "generated-400mp.png",
      "generated-large.jpg",
    ])
      await open(name);
    await open("generated-100mp.jpg", true);
    await open("basic.png");
    await page.locator(".image-viewer").click({ position: { x: 200, y: 200 } });
    await page.keyboard.press("1");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.locator(".image-controls summary").click();
    await page.getByLabel("Image background").selectOption("light");
    await page.getByRole("button", { name: "Rotate", exact: true }).click();
    const style = await page
      .locator(".image-viewer canvas")
      .getAttribute("style");
    if (!style.includes("90deg") || !style.includes("1.25"))
      throw Error("zoom rotation failed");
    await page.getByRole("button", { name: "Copy image", exact: true }).click();
    await page.getByText("Image copied as PNG.", { exact: true }).waitFor();
    result.checks.push("Zoom, rotate, background and image clipboard");
    const viewerBox = await page.locator(".image-viewer").boundingBox();
    await page.mouse.move(
      viewerBox.x + viewerBox.width / 2,
      viewerBox.y + viewerBox.height / 2,
    );
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.getByLabel("Image inspection").waitFor();
    await page.getByText("Pixel (80, 40)", { exact: true }).waitFor();
    result.checks.push(
      "Pixel inspector maps zoomed/rotated center to source coordinates",
    );
    await page.getByRole("button", { name: "Copy HEX", exact: true }).click();
    if (
      (await page.evaluate(() => navigator.clipboard.readText())) !== "#ffff00"
    )
      throw Error("Pixel HEX copy mismatch");
    result.checks.push("Pixel clipboard copies the sampled HEX value");
    const selectedStyle = await page
      .locator(".image-viewer canvas")
      .getAttribute("style");
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "photo.jpg", exact: true })
      .click();
    await page.getByLabel("Image viewer", { exact: true }).waitFor();
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "basic.png", exact: true })
      .last()
      .click();
    await page.getByLabel("Image viewer", { exact: true }).waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector(".image-viewer canvas")
        ?.style.transform.includes("90deg"),
    );
    if (
      (await page.locator(".image-viewer canvas").getAttribute("style")) !==
      selectedStyle
    )
      throw Error("Session view changed across file switch");
    result.checks.push("Zoom, rotation and background survive tab switches");
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "malformed.svg", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open as Text", exact: true })
      .click();
    await page.getByLabel("Read-only text", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Default viewer", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Unable to preview image", exact: true })
      .waitFor();
    result.checks.push(
      "Malformed SVG opens safely as Text and returns to default viewer",
    );
    await page
      .getByRole("navigation", { name: "Opened files" })
      .getByRole("button", { name: "basic.png", exact: true })
      .last()
      .click();
    await page.getByLabel("Image viewer", { exact: true }).waitFor();
    await page.screenshot({
      path: "docs/qa/foundation-images-browser.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Back to workspace", exact: true })
      .click();
    await page.waitForTimeout(150);
    result.resourcesAfterClose = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(window.prismImageLive).map(([key, set]) => [
          key,
          set.size,
        ]),
      ),
    );
    if (Object.values(result.resourcesAfterClose).some(Boolean))
      throw Error("Image resources remained after closing workspace");
    result.checks.push(
      "All image bitmaps, workers, decoders and object URLs released",
    );
    if (result.errors.length) throw Error(result.errors.join("; "));
  } catch (error) {
    result.failure = error.stack;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(
      "docs/qa/foundation-images-browser-results.json",
      JSON.stringify(result, null, 2),
    );
    await browser.close();
    console.log(JSON.stringify(result, null, 2));
  }
})();
