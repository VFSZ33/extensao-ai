import { PANEL_LEADS_URL, panelReport } from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { VerifiedLead } from "@/lib/integration-status";

import {
  checkSubmissionInPanel,
  findPanelTab,
  isTrackingExpired,
  readNextCheck,
  type SubmissionCheck,
  TRACKING_DURATION_MS,
  TRACKING_INTERVAL_MS,
} from "@/lib/submission-tracking";

type Injection = { args?: unknown[]; files?: string[]; target: object };

const SUBMISSION_ID = "LT-20261008-141748-012";
const permissions: { contains: (permissions: object) => Promise<boolean> } =
  browser.permissions;
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;
const testLead = panelReport.leads[0] as VerifiedLead;

function found(status: VerifiedLead["status"]): SubmissionCheck {
  return { lead: { ...testLead, status }, status: "found" };
}

describe("Acompanhamento do envio no painel", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("repete a cada 15 s enquanto o lead está pendente, sem evento ou ainda não chegou", () => {
    expect(TRACKING_INTERVAL_MS).toBe(15000);

    for (const check of [
      found("pending"),
      found("no-events"),
      { status: "not-found" } as const,
    ]) {
      expect(readNextCheck(check, 0, 60000)).toBe(75000);
    }
  });

  it.each<SubmissionCheck>([
    found("ok"),
    found("error"),
    found("not-confirmed"),
    found("unavailable"),
    { status: "no-panel" },
    { status: "no-access" },
    { message: "A sessão do painel expirou.", status: "error" },
  ])("para no resultado conclusivo ou sem como consultar: %j", (check) => {
    expect(readNextCheck(check, 0, 60000)).toBeUndefined();
  });

  it("para depois de 5 min", () => {
    expect(TRACKING_DURATION_MS).toBe(300000);
    expect(readNextCheck(found("pending"), 0, 270000)).toBe(285000);
    expect(readNextCheck(found("pending"), 0, 285000)).toBeUndefined();
    expect(isTrackingExpired(0, 299999)).toBe(false);
    expect(isTrackingExpired(0, 300000)).toBe(true);
  });

  it("escolhe a aba do painel aberta numa conta usada por último", async () => {
    const query = vi.spyOn(tabs, "query").mockResolvedValue([
      {
        id: 3,
        lastAccessed: 30,
        url: "https://admin.autodromo.com.br/#/contas",
      },
      { id: 4, lastAccessed: 10, url: PANEL_LEADS_URL },
      { discarded: true, id: 5, lastAccessed: 50, url: PANEL_LEADS_URL },
      { id: 6, lastAccessed: 20, url: PANEL_LEADS_URL + "&search=x" },
      { lastAccessed: 60, url: PANEL_LEADS_URL },
    ]);
    await expect(findPanelTab()).resolves.toEqual({
      id: 6,
      url: PANEL_LEADS_URL + "&search=x",
    });
    expect(query).toHaveBeenCalledWith({
      url: "https://admin.autodromo.com.br/*",
    });
  });

  it("informa quando não há painel aberto numa conta, sem tocar em nenhuma aba", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 3, url: "https://admin.autodromo.com.br/#/contas" },
    ]);
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    await expect(checkSubmissionInPanel(SUBMISSION_ID)).resolves.toEqual({
      status: "no-panel",
    });
    vi.spyOn(tabs, "query").mockRejectedValue(new Error("Falha"));
    await expect(checkSubmissionInPanel(SUBMISSION_ID)).resolves.toEqual({
      status: "no-panel",
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("informa quando não tem acesso à aba do painel, sem consultar a API", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 4, url: PANEL_LEADS_URL },
    ]);
    vi.spyOn(permissions, "contains").mockResolvedValue(false);
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockRejectedValue(new Error("Cannot access contents of the page."));
    await expect(checkSubmissionInPanel(SUBMISSION_ID)).resolves.toEqual({
      status: "no-access",
    });
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it("consulta na aba do painel o lead pelo identificador do envio", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 4, url: PANEL_LEADS_URL },
    ]);
    vi.spyOn(permissions, "contains").mockResolvedValue(true);
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async (injection) => [
        {
          documentId: "document",
          frameId: 0,
          result:
            "files" in injection
              ? {
                  ok: true,
                  result: {
                    leads: [panelReport.leads[1], panelReport.leads[0]],
                    missingLeads: 0,
                  },
                }
              : undefined,
        },
      ]);
    await expect(checkSubmissionInPanel(SUBMISSION_ID)).resolves.toEqual({
      lead: panelReport.leads[0],
      status: "found",
    });
    const injections = executeScript.mock.calls.map(
      ([injection]) => injection as Injection,
    );
    expect(injections.map(({ target }) => target)).toEqual([
      { tabId: 4 },
      { tabId: 4 },
    ]);
    expect(injections[0]?.args?.[1]).toEqual({
      limit: 5,
      search: SUBMISSION_ID,
    });
  });

  it("informa o lead ainda ausente e o erro da consulta", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 4, url: PANEL_LEADS_URL },
    ]);
    vi.spyOn(permissions, "contains").mockResolvedValue(true);
    vi.spyOn(browser.scripting, "executeScript")
      .mockImplementationOnce(async () => [
        { documentId: "d", frameId: 0, result: undefined },
      ])
      .mockImplementationOnce(async () => [
        {
          documentId: "d",
          frameId: 0,
          result: {
            ok: true,
            result: { leads: [panelReport.leads[1]], missingLeads: 0 },
          },
        },
      ])
      .mockImplementationOnce(async () => [
        { documentId: "d", frameId: 0, result: undefined },
      ])
      .mockImplementationOnce(async () => [
        {
          documentId: "d",
          frameId: 0,
          result: {
            error:
              "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
            ok: false,
          },
        },
      ]);
    await expect(checkSubmissionInPanel(SUBMISSION_ID)).resolves.toEqual({
      status: "not-found",
    });
    await expect(checkSubmissionInPanel(SUBMISSION_ID)).resolves.toEqual({
      message:
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      status: "error",
    });
  });
});
