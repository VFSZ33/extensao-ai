import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { RecognizedForm } from "@/lib/page-command";

import { createLeadData } from "@/lib/lead-data";
import { detectPageForms, submitTestLead } from "@/lib/page-forms";
import { readSubmissionHistory } from "@/lib/submission-history";

const form: RecognizedForm = {
  definitionId: "autodromo-offer",
  definitionName: "Formulário de oferta",
  index: 2,
  label: "oferta - GEELY EX5 PRO - Enviar",
};
const page = { pageUrl: "https://example.com/oferta", tabId: 7 };
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

function mockPageResult(result: unknown) {
  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async (injection) => [
      {
        documentId: "document",
        frameId: 0,
        result: "files" in injection ? result : undefined,
      },
    ]);
}

describe("Formulários da aba ativa", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 8, 5, 9));
  });

  it("procura os formulários na aba ativa da janela atual", async () => {
    const executeScript = mockPageResult({ ok: true, result: [form] });
    const query = vi
      .spyOn(tabs, "query")
      .mockResolvedValue([{ id: 7, url: "https://example.com/oferta" }]);
    await expect(detectPageForms()).resolves.toEqual({
      forms: [form],
      pageUrl: "https://example.com/oferta",
      tabId: 7,
    });
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      args: ["leadIntegrationTesterPageCommand", { type: "detect-forms" }],
      func: expect.any(Function),
      target: { tabId: 7 },
    });
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      files: ["/lead-forms.js"],
      target: { tabId: 7 },
    });
  });

  it("informa quando não há aba ativa identificável", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([{}]);
    await expect(detectPageForms()).rejects.toThrow(
      "Não foi possível identificar a aba ativa.",
    );
  });

  it("informa quando a página não permite acesso", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7 }]);
    vi.spyOn(browser.scripting, "executeScript").mockRejectedValue(
      new Error("Cannot access a chrome:// URL"),
    );
    await expect(detectPageForms()).rejects.toThrow(
      "Não foi possível acessar esta página. Abra uma página web comum e clique no ícone da extensão para tentar de novo.",
    );
  });

  it.each([
    undefined,
    null,
    {},
    { ok: true },
    { ok: true, result: [{ definitionId: "autodromo-offer" }] },
    { ok: false },
  ])("rejeita a resposta inválida %j da página", async (response) => {
    vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7 }]);
    mockPageResult(response);
    await expect(detectPageForms()).rejects.toThrow(
      "A página retornou uma resposta inválida.",
    );
  });

  it("envia dados derivados do identificador e grava o histórico", async () => {
    const values = { name: "Teste LT-20261007-080509-001", whatsapping: true };
    const executeScript = mockPageResult({ ok: true, result: values });
    const record = {
      definitionId: "autodromo-offer",
      definitionName: "Formulário de oferta",
      formLabel: "oferta - GEELY EX5 PRO - Enviar",
      id: "LT-20261007-080509-001",
      pageUrl: "https://example.com/oferta",
      submittedAt: new Date(2026, 9, 7, 8, 5, 9).toISOString(),
      values,
    };
    await expect(submitTestLead(page, form)).resolves.toEqual(record);
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      args: [
        "leadIntegrationTesterPageCommand",
        {
          definitionId: "autodromo-offer",
          index: 2,
          lead: createLeadData("LT-20261007-080509-001"),
          type: "submit-form",
        },
      ],
      func: expect.any(Function),
      target: { tabId: 7 },
    });
    await expect(readSubmissionHistory()).resolves.toEqual([record]);
  });

  it("usa um identificador novo a cada envio", async () => {
    mockPageResult({ ok: true, result: {} });
    const first = await submitTestLead(page, form);
    const second = await submitTestLead(page, form);
    expect([first.id, second.id]).toEqual([
      "LT-20261007-080509-001",
      "LT-20261007-080509-002",
    ]);
    await expect(readSubmissionHistory()).resolves.toHaveLength(2);
  });

  it("propaga o erro da página sem gravar o histórico", async () => {
    mockPageResult({
      error: 'Campo "cpf" da definição não encontrado no formulário.',
      ok: false,
    });
    await expect(submitTestLead(page, form)).rejects.toThrow(
      'Campo "cpf" da definição não encontrado no formulário.',
    );
    await expect(readSubmissionHistory()).resolves.toEqual([]);
  });

  it("avisa quando o envio foi disparado e o histórico não foi gravado", async () => {
    mockPageResult({ ok: true, result: {} });
    vi.spyOn(browser.storage.local, "set")
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("QUOTA_BYTES"));
    await expect(submitTestLead(page, form)).rejects.toThrow(
      "O envio LT-20261007-080509-001 foi disparado, mas não foi gravado no histórico.",
    );
  });
});
