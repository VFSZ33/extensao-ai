import { chromium } from "@playwright/test";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "wxt";

export default defineConfig({
  alias: { "@tests": resolve("tests") },
  imports: false,
  manifest: {
    description: "Base para testar a captação e integração de leads.",
    name: "Lead Integration Tester",
  },
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  vite: () => ({ plugins: [tailwindcss()] }),
  webExt: { binaries: { chrome: chromium.executablePath() } },
});
