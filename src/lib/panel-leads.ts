import { browser } from "wxt/browser";

import { getActiveTab } from "@/lib/active-tab";
import {
  isLeadIntegrationReport,
  type LeadIntegrationReport,
} from "@/lib/integration-status";
import { parsePageResponse } from "@/lib/page-command";
import { isPanelUrl, PANEL_REQUIRED_MESSAGE } from "@/lib/panel-session";

export async function isPanelActive(): Promise<boolean> {
  try {
    return isPanelUrl((await getActiveTab()).url);
  } catch {
    return false;
  }
}

export async function verifyPanelLeads(): Promise<LeadIntegrationReport> {
  const tab = await getActiveTab();

  if (!isPanelUrl(tab.url)) {
    throw new Error(PANEL_REQUIRED_MESSAGE);
  }

  let result: unknown;

  try {
    const [injection] = await browser.scripting.executeScript({
      files: ["/lead-integrations.js"],
      target: { tabId: tab.id },
      world: "ISOLATED",
    });
    result = injection?.result;
  } catch {
    throw new Error(
      "Não foi possível acessar o painel nesta aba. Clique no ícone da extensão com o painel aberto e tente de novo.",
    );
  }

  const response = parsePageResponse(result, isLeadIntegrationReport);

  if (!response) {
    throw new Error("O painel retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.result;
}
