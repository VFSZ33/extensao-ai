import { browser } from "wxt/browser";

import { getActiveTab } from "@/lib/active-tab";
import {
  isLeadIntegrationReport,
  type LeadIntegrationReport,
} from "@/lib/integration-status";
import { parsePageResponse } from "@/lib/page-command";
import {
  PANEL_QUERY_KEY,
  type PanelQuery,
  parsePanelQuery,
} from "@/lib/panel-query";
import {
  isPanelUrl,
  PANEL_ORIGIN,
  PANEL_REQUIRED_MESSAGE,
} from "@/lib/panel-session";

export async function isPanelActive(): Promise<boolean> {
  try {
    return isPanelUrl((await getActiveTab()).url);
  } catch {
    return false;
  }
}

export async function verifyPanelLeads(
  query: PanelQuery,
): Promise<LeadIntegrationReport> {
  const panelQuery = parsePanelQuery(query);

  if (!panelQuery) {
    throw new Error("Escolha uma quantidade válida e revise a busca.");
  }

  const tab = await getActiveTab();

  if (!isPanelUrl(tab.url)) {
    throw new Error(PANEL_REQUIRED_MESSAGE);
  }

  let result: unknown;

  try {
    await browser.scripting.executeScript({
      args: [PANEL_QUERY_KEY, panelQuery, PANEL_ORIGIN],
      func: storePanelQuery,
      target: { tabId: tab.id },
      world: "ISOLATED",
    });
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

function storePanelQuery(key: string, query: PanelQuery, origin: string): void {
  if (location.origin === origin) {
    Reflect.set(globalThis, key, query);
  }
}
