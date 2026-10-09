import { chromium } from "@playwright/test";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "wxt";

export default defineConfig({
  alias: { "@tests": resolve("tests") },
  imports: false,
  manifest: {
    description:
      "Envia leads de teste pelos formulários da página e confere as integrações no painel.",
    name: "Scanner de Leads",
    permissions: ["activeTab", "scripting", "storage"],
  },
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  vite: () => ({ plugins: [tailwindcss()] }),
  webExt: { binaries: { chrome: chromium.executablePath() } },
});
