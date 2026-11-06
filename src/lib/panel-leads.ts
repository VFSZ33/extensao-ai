import { browser } from "wxt/browser";

import { type ActiveTab, getActiveTab } from "@/lib/active-tab";
import {
  PANEL_FOCUS_LOCK,
  PANEL_QUERY_LOCK,
  runExclusive,
} from "@/lib/exclusive-task";
import {
  isLeadIntegrationReport,
  type LeadIntegrationReport,
} from "@/lib/integration-status";
import {
  isLeadFocusResult,
  LEAD_FOCUS_KEY,
  type LeadFocusCommand,
  type LeadFocusResult,
  parseLeadFocusCommand,
} from "@/lib/lead-focus";
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

const PANEL_ACCESS_MESSAGE =
  "Não foi possível acessar o painel nesta aba. Clique no ícone da extensão com o painel aberto e tente de novo.";

export async function focusPanelLead(
  tab: ActiveTab,
  command: LeadFocusCommand,
): Promise<LeadFocusResult> {
  const focus = parseLeadFocusCommand(command);

  if (!focus) {
    throw new Error(
      "Não foi possível localizar este lead: os dados dele vieram em formato inesperado.",
    );
  }

  if (!isPanelUrl(tab.url)) {
    throw new Error(PANEL_REQUIRED_MESSAGE);
  }

  const response = parsePageResponse(
    await runExclusive(PANEL_FOCUS_LOCK, () =>
      runPanelScript(tab.id, LEAD_FOCUS_KEY, focus, "/lead-focus.js"),
    ),
    isLeadFocusResult,
  );

  if (!response) {
    throw new Error("O painel retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.result;
}

export async function isPanelActive(): Promise<boolean> {
  try {
    return isPanelUrl((await getActiveTab()).url);
  } catch {
    return false;
  }
}

export async function verifyPanelLeads(
  query: PanelQuery,
  tab?: ActiveTab,
): Promise<LeadIntegrationReport> {
  const panelQuery = parsePanelQuery(query);

  if (!panelQuery) {
    throw new Error("Escolha uma quantidade válida e revise a busca.");
  }

  const panelTab = tab ?? (await getActiveTab());

  if (!isPanelUrl(panelTab.url)) {
    throw new Error(PANEL_REQUIRED_MESSAGE);
  }

  const response = parsePageResponse(
    await runExclusive(PANEL_QUERY_LOCK, () =>
      runPanelScript(
        panelTab.id,
        PANEL_QUERY_KEY,
        panelQuery,
        "/lead-integrations.js",
      ),
    ),
    isLeadIntegrationReport,
  );

  if (!response) {
    throw new Error("O painel retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.result;
}

async function runPanelScript(
  tabId: number,
  key: string,
  value: LeadFocusCommand | PanelQuery,
  file: "/lead-focus.js" | "/lead-integrations.js",
): Promise<unknown> {
  try {
    await browser.scripting.executeScript({
      args: [key, value, PANEL_ORIGIN],
      func: storePanelQuery,
      target: { tabId },
      world: "ISOLATED",
    });
    const [injection] = await browser.scripting.executeScript({
      files: [file],
      target: { tabId },
      world: "ISOLATED",
    });

    return injection?.result;
  } catch {
    throw new Error(PANEL_ACCESS_MESSAGE);
  }
}

function storePanelQuery(
  key: string,
  query: LeadFocusCommand | PanelQuery,
  origin: string,
): void {
  if (location.origin === origin) {
    Reflect.set(globalThis, key, query);
  }
}
