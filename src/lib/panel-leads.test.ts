import {
  PANEL_ACCOUNT_ID,
  PANEL_LEADS_URL,
  panelReport,
} from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { isPanelActive, verifyPanelLeads } from "@/lib/panel-leads";

const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

function mockPanelResult(result: unknown, url = PANEL_LEADS_URL) {
  vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7, url }]);

  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async () => [
      { documentId: "document", frameId: 0, result },
    ]);
}

describe("Verificação dos leads na aba do painel", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("reconhece o painel na aba ativa da janela atual", async () => {
    const query = vi
      .spyOn(tabs, "query")
      .mockResolvedValue([{ id: 7, url: PANEL_LEADS_URL }]);
    await expect(isPanelActive()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it.each([
    [[{ id: 7, url: "https://example.com/" }]],
    [[{ id: 7 }]],
    [[{}]],
    [[]],
  ])("não reconhece o painel na aba %j", async (activeTabs) => {
    vi.spyOn(tabs, "query").mockResolvedValue(activeTabs);
    await expect(isPanelActive()).resolves.toBe(false);
  });

  it("não reconhece o painel quando a aba não pode ser consultada", async () => {
    vi.spyOn(tabs, "query").mockRejectedValue(new Error("Unavailable"));
    await expect(isPanelActive()).resolves.toBe(false);
  });

  it("injeta o script de leitura no mundo isolado da aba do painel", async () => {
    const executeScript = mockPanelResult({ ok: true, result: panelReport });
    await expect(verifyPanelLeads()).resolves.toEqual(panelReport);
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      files: ["/lead-integrations.js"],
      target: { tabId: 7 },
      world: "ISOLATED",
    });
  });

  it.each([
    "https://example.com/#/contas/" + PANEL_ACCOUNT_ID + "/leads?page=1",
    "https://example.com/contas/" + PANEL_ACCOUNT_ID + "/leads",
    "http://admin.autodromo.com.br/#/contas/" + PANEL_ACCOUNT_ID + "/leads",
    "https://admin.autodromo.com.br.example.com/",
    "",
  ])("não injeta nada na aba %j", async (url) => {
    const executeScript = mockPanelResult(
      { ok: true, result: panelReport },
      url,
    );
    await expect(verifyPanelLeads()).rejects.toThrow(
      "Abra o painel administrativo na aba ativa para verificar as integrações.",
    );
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("informa quando não há aba ativa identificável", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([{}]);
    await expect(verifyPanelLeads()).rejects.toThrow(
      "Não foi possível identificar a aba ativa.",
    );
  });

  it("informa quando a aba do painel não permite acesso", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: PANEL_LEADS_URL },
    ]);
    vi.spyOn(browser.scripting, "executeScript").mockRejectedValue(
      new Error("Cannot access contents of the page"),
    );
    await expect(verifyPanelLeads()).rejects.toThrow(
      "Não foi possível acessar o painel nesta aba. Clique no ícone da extensão com o painel aberto e tente de novo.",
    );
  });

  it("propaga o erro devolvido pelo script", async () => {
    mockPanelResult({
      error:
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      ok: false,
    });
    await expect(verifyPanelLeads()).rejects.toThrow(
      "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
    );
  });

  it.each([
    undefined,
    null,
    {},
    { ok: true },
    { ok: true, result: {} },
    { ok: true, result: { leads: [{ id: "lead" }] } },
    {
      ok: true,
      result: { leads: [{ ...panelReport.leads[0], status: "enviado" }] },
    },
    { ok: false },
  ])("rejeita a resposta inválida %j do script", async (response) => {
    mockPanelResult(response);
    await expect(verifyPanelLeads()).rejects.toThrow(
      "O painel retornou uma resposta inválida.",
    );
  });
});
