import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("verifica a extensão instalada com o background real", async () => {
  const extensionPath = resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    args: [
      "--disable-extensions-except=" + extensionPath,
      "--load-extension=" + extensionPath,
    ],
    channel: "chromium",
    headless: true,
  });

  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto("chrome-extension://" + extensionId + "/popup.html");
    await expect(
      page.getByRole("heading", { name: "Teste de integração de leads" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Verificar extensão" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Extensão conectada ao background.",
    );
  } finally {
    await context.close();
  }
});
