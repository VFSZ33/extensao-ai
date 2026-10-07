import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  retries: 0,
  testDir: "./tests/e2e",
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
  workers: 1,
});
