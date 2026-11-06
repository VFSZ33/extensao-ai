import {
  PANEL_ACCOUNT_ID,
  PANEL_LEADS_URL,
  panelReport,
} from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { VerifiedLead } from "@/lib/integration-status";

import { createLeadFocusCommand } from "@/lib/lead-focus";
import {
  focusPanelLead,
  isPanelActive,
  verifyPanelLeads,
} from "@/lib/panel-leads";

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

describe("Consulta e foco numa aba do painel escolhida", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("consulta a aba do painel indicada sem procurar a aba ativa", async () => {
    const query = vi.spyOn(tabs, "query");
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async () => [
        {
          documentId: "document",
          frameId: 0,
          result: { ok: true, result: panelReport },
        },
      ]);
    await expect(
      verifyPanelLeads(QUERY, { id: 12, url: PANEL_LEADS_URL }),
    ).resolves.toEqual(panelReport);
    expect(query).not.toHaveBeenCalled();
    expect(readInjections(executeScript).map(({ target }) => target)).toEqual([
      { tabId: 12 },
      { tabId: 12 },
    ]);
    await expect(
      verifyPanelLeads(QUERY, { id: 12, url: "https://example.com/" }),
    ).rejects.toThrow(
      "Abra o painel administrativo na aba ativa para verificar as integrações.",
    );
  });

  it("nunca faz duas consultas ao mesmo tempo: a segunda espera a primeira", async () => {
    const finishes: ((value: unknown) => void)[] = [];
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async (injection) =>
        "files" in injection
          ? [
              {
                documentId: "document",
                frameId: 0,
                result: await new Promise((resolve) => {
                  finishes.push(resolve);
                }),
              },
            ]
          : [{ documentId: "document", frameId: 0, result: undefined }],
      );
    const tab = { id: 7, url: PANEL_LEADS_URL };
    const first = verifyPanelLeads(QUERY, tab);
    const second = verifyPanelLeads({ limit: 5, search: "LT" }, tab);
    await vi.waitFor(() => expect(finishes).toHaveLength(1));
    expect(executeScript).toHaveBeenCalledTimes(2);
    finishes[0]?.({ ok: true, result: panelReport });
    await expect(first).resolves.toEqual(panelReport);
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    expect(readInjections(executeScript)[2]?.args?.[1]).toEqual({
      limit: 5,
      search: "LT",
    });
    finishes[1]?.({ ok: true, result: { leads: [], missingLeads: 0 } });
    await expect(second).resolves.toEqual({ leads: [], missingLeads: 0 });
  });

  it("entrega o pedido de foco e injeta o script de foco no mundo isolado da aba do painel", async () => {
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async () => [
        {
          documentId: "document",
          frameId: 0,
          result: {
            ok: true,
            result: { detail: "confirmed", row: "ambiguous" },
          },
        },
      ]);
    const command = createLeadFocusCommand(
      panelReport.leads[0] as VerifiedLead,
      PANEL_ACCOUNT_ID,
    );
    await expect(
      focusPanelLead({ id: 7, url: PANEL_LEADS_URL }, command),
    ).resolves.toEqual({ detail: "confirmed", row: "ambiguous" });
    const [store, run] = readInjections(executeScript);
    expect(store).toMatchObject({
      args: [
        "leadIntegrationTesterLeadFocus",
        command,
        "https://admin.autodromo.com.br",
      ],
      target: { tabId: 7 },
      world: "ISOLATED",
    });
    expect(run).toEqual({
      files: ["/lead-focus.js"],
      target: { tabId: 7 },
      world: "ISOLATED",
    });
  });

  it("não toca na aba com pedido de foco inválido ou fora do painel", async () => {
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    const command = createLeadFocusCommand(
      panelReport.leads[0] as VerifiedLead,
      PANEL_ACCOUNT_ID,
    );
    await expect(
      focusPanelLead(
        { id: 7, url: PANEL_LEADS_URL },
        { ...command, leadId: "../contas" },
      ),
    ).rejects.toThrow(
      "Não foi possível localizar este lead: os dados dele vieram em formato inesperado.",
    );
    await expect(
      focusPanelLead({ id: 7, url: "https://example.com/" }, command),
    ).rejects.toThrow(
      "Abra o painel administrativo na aba ativa para verificar as integrações.",
    );
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("propaga o erro do script de foco e rejeita resposta inválida", async () => {
    const command = createLeadFocusCommand(
      panelReport.leads[0] as VerifiedLead,
      PANEL_ACCOUNT_ID,
    );
    const tab = { id: 7, url: PANEL_LEADS_URL };
    vi.spyOn(browser.scripting, "executeScript")
      .mockImplementationOnce(async () => [
        { documentId: "d", frameId: 0, result: undefined },
      ])
      .mockImplementationOnce(async () => [
        {
          documentId: "d",
          frameId: 0,
          result: { error: "A aba não está no painel.", ok: false },
        },
      ])
      .mockImplementationOnce(async () => [
        { documentId: "d", frameId: 0, result: undefined },
      ])
      .mockImplementationOnce(async () => [
        {
          documentId: "d",
          frameId: 0,
          result: { ok: true, result: { detail: "sim", row: "highlighted" } },
        },
      ]);
    await expect(focusPanelLead(tab, command)).rejects.toThrow(
      "A aba não está no painel.",
    );
    await expect(focusPanelLead(tab, command)).rejects.toThrow(
      "O painel retornou uma resposta inválida.",
    );
  });
});
