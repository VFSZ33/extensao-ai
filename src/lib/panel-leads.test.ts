import {
  PANEL_ACCOUNT_ID,
  PANEL_LEADS_URL,
  panelReport,
} from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { isPanelActive, verifyPanelLeads } from "@/lib/panel-leads";

type Injection = {
  args?: unknown[];
  files?: string[];
  func?: (...args: never[]) => unknown;
  target: object;
  world?: string;
};

const QUERY = { limit: 10, search: "" } as const;
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

function mockPanelResult(result: unknown, url = PANEL_LEADS_URL) {
  vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7, url }]);

  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async () => [
      { documentId: "document", frameId: 0, result },
    ]);
}

function readInjections(executeScript: { mock: { calls: unknown[][] } }) {
  return executeScript.mock.calls.map(([injection]) => injection as Injection);
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

  it("entrega a consulta e injeta o script de leitura no mundo isolado da aba do painel", async () => {
    const executeScript = mockPanelResult({ ok: true, result: panelReport });
    await expect(
      verifyPanelLeads({ limit: 5, search: "  LT-20261008  " }),
    ).resolves.toEqual(panelReport);
    const [store, read] = readInjections(executeScript);
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(store).toMatchObject({
      args: [
        "leadIntegrationTesterPanelQuery",
        { limit: 5, search: "LT-20261008" },
        "https://admin.autodromo.com.br",
      ],
      target: { tabId: 7 },
      world: "ISOLATED",
    });
    expect(read).toEqual({
      files: ["/lead-integrations.js"],
      target: { tabId: 7 },
      world: "ISOLATED",
    });
  });

  it("guarda a consulta só na origem do painel", async () => {
    const executeScript = mockPanelResult({ ok: true, result: panelReport });
    await verifyPanelLeads(QUERY);
    const [store] = readInjections(executeScript);
    const key = "leadIntegrationTesterPanelQuery";
    const storeQuery = store?.func as unknown as (...args: unknown[]) => void;
    storeQuery(key, QUERY, location.origin);
    expect(Reflect.get(globalThis, key)).toEqual(QUERY);
    Reflect.deleteProperty(globalThis, key);
    storeQuery(key, QUERY, "https://admin.autodromo.com.br");
    expect(Reflect.has(globalThis, key)).toBe(false);
  });

  it.each([
    { limit: 7, search: "" },
    { limit: 10, search: "a".repeat(101) },
  ])("não acessa a aba com a consulta inválida %j", async (query) => {
    const executeScript = mockPanelResult({ ok: true, result: panelReport });
    await expect(verifyPanelLeads(query as typeof QUERY)).rejects.toThrow(
      "Escolha uma quantidade válida e revise a busca.",
    );
    expect(executeScript).not.toHaveBeenCalled();
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
    await expect(verifyPanelLeads(QUERY)).rejects.toThrow(
      "Abra o painel administrativo na aba ativa para verificar as integrações.",
    );
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("informa quando não há aba ativa identificável", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([{}]);
    await expect(verifyPanelLeads(QUERY)).rejects.toThrow(
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
    await expect(verifyPanelLeads(QUERY)).rejects.toThrow(
      "Não foi possível acessar o painel nesta aba. Clique no ícone da extensão com o painel aberto e tente de novo.",
    );
  });

  it("propaga o erro devolvido pelo script", async () => {
    mockPanelResult({
      error:
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      ok: false,
    });
    await expect(verifyPanelLeads(QUERY)).rejects.toThrow(
      "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
    );
  });

  it.each([
    undefined,
    null,
    {},
    { ok: true },
    { ok: true, result: {} },
    { ok: true, result: { leads: [] } },
    { ok: true, result: { leads: [{ id: "lead" }], missingLeads: 0 } },
    {
      ok: true,
      result: {
        leads: [{ ...panelReport.leads[0], status: "enviado" }],
        missingLeads: 0,
      },
    },
    { ok: false },
  ])("rejeita a resposta inválida %j do script", async (response) => {
    mockPanelResult(response);
    await expect(verifyPanelLeads(QUERY)).rejects.toThrow(
      "O painel retornou uma resposta inválida.",
    );
  });
});
