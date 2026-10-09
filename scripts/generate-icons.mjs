import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve("public/icon");
const sizes = [16, 32, 48, 128];
const source = await readFile(resolve("src/assets/icon.svg"), "utf8");

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();

try {
  const page = await browser.newPage();

  for (const size of sizes) {
    await page.setViewportSize({ height: size, width: size });
    await page.setContent(
      "<style>html,body{margin:0}svg{display:block}</style>" + source,
    );
    await page.screenshot({
      omitBackground: true,
      path: resolve(outputDirectory, size + ".png"),
    });
  }
} finally {
  await browser.close();
}
