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
    optional_host_permissions: ["https://*/*"],
    permissions: ["activeTab", "scripting", "sidePanel", "storage", "tabs"],
  },
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  vite: () => ({ plugins: [tailwindcss()] }),
  webExt: { binaries: { chrome: chromium.executablePath() } },
});
