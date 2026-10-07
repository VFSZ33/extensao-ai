import "@/assets/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ExtensionPopup } from "@/components/extension-popup";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Não foi possível montar a interface da extensão.");
}

createRoot(root).render(
  <StrictMode>
    <ExtensionPopup />
  </StrictMode>,
);
