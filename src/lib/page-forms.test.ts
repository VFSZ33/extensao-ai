import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { RecognizedForm } from "@/lib/page-command";

import { createLeadData } from "@/lib/lead-data";
import {
  detectPageForms,
  findUnchangedForm,
  submitTestLead,
} from "@/lib/page-forms";
import { readSubmissionHistory } from "@/lib/submission-history";

const form: RecognizedForm = {
  definitionId: "autodromo-offer",
  definitionName: "Formulário de oferta",
  index: 2,
  label: "oferta - GEELY EX5 PRO - Enviar",
  selects: [
    {
      key: "unit",
      label: "Unidade",
      options: [{ label: "Unidade Norte", value: "north" }],
    },
  ],
};
const page = { pageUrl: "https://example.com/oferta", tabId: 7 };
const tabs: {
  get: (tabId: number) => Promise<object>;
  query: (query: object) => Promise<object[]>;
} = browser.tabs;
const unitForm: RecognizedForm = {
  ...form,
  definitionId: "autodromo-section",
  definitionName: "Formulário de seção",
  selects: [
    {
      key: "unit",
      label: "Unidade",
      options: [
        { label: "Unidade Norte", value: "north" },
        { label: "Unidade Sul", value: "south" },
      ],
      unit: true,
    },
  ],
};

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
      documentId: "document",
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
    { ok: true, result: [{ ...form, selects: undefined }] },
    { ok: true, result: [{ ...form, selects: [{ key: "unit" }] }] },
    { ok: false },
  ])("rejeita a resposta inválida %j da página", async (response) => {
    vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7 }]);
    mockPageResult(response);
    await expect(detectPageForms()).rejects.toThrow(
      "A página retornou uma resposta inválida.",
    );
  });

  it("envia dados derivados do identificador e grava o histórico", async () => {
    const values = {
      name: "Teste LT-20261007-080509-001",
      unit: { label: "Unidade Norte", value: "north" },
      whatsapping: true,
    };
    const executeScript = mockPageResult({
      ok: true,
      result: { unfilledFields: ["city"], values },
    });
    const record = {
      definitionId: "autodromo-offer",
      definitionName: "Formulário de oferta",
      formLabel: "oferta - GEELY EX5 PRO - Enviar",
      id: "LT-20261007-080509-001",
      pageUrl: "https://example.com/oferta",
      submittedAt: new Date(2026, 9, 7, 8, 5, 9).toISOString(),
      values,
    };
    await expect(
      submitTestLead(page, form, { unit: "north" }),
    ).resolves.toEqual({ record, unfilledFields: ["city"] });
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      args: [
        "leadIntegrationTesterPageCommand",
        {
          definitionId: "autodromo-offer",
          index: 2,
          lead: createLeadData("LT-20261007-080509-001"),
          selections: { unit: "north" },
          type: "submit-form",
        },
      ],
      func: expect.any(Function),
      target: { tabId: 7 },
    });
    await expect(readSubmissionHistory()).resolves.toEqual([record]);
  });

  it("usa um identificador novo a cada envio", async () => {
    mockPageResult({ ok: true, result: { unfilledFields: [], values: {} } });
    const first = await submitTestLead(page, form);
    const second = await submitTestLead(page, form);
    expect([first.record.id, second.record.id]).toEqual([
      "LT-20261007-080509-001",
      "LT-20261007-080509-002",
    ]);
    await expect(readSubmissionHistory()).resolves.toHaveLength(2);
  });

  it.each([{}, { name: "Teste" }, { unfilledFields: [1], values: {} }])(
    "rejeita o resultado inválido %j do envio",
    async (result) => {
      mockPageResult({ ok: true, result });
      await expect(submitTestLead(page, form)).rejects.toThrow(
        "A página retornou uma resposta inválida.",
      );
      await expect(readSubmissionHistory()).resolves.toEqual([]);
    },
  );

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
    mockPageResult({ ok: true, result: { unfilledFields: [], values: {} } });
    vi.spyOn(browser.storage.local, "set")
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("QUOTA_BYTES"));
    await expect(submitTestLead(page, form)).rejects.toThrow(
      "O envio LT-20261007-080509-001 foi disparado, mas não foi gravado no histórico.",
    );
  });
});

describe("Envio com unidade e página conferida", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 8, 5, 9));
  });

  it("grava no registro a unidade do seletor marcado como unidade", async () => {
    mockPageResult({
      ok: true,
      result: {
        unfilledFields: [],
        values: { unit: { label: "Unidade Sul", value: "south" } },
      },
    });
    const { record } = await submitTestLead(page, unitForm, { unit: "south" });
    expect(record.unit).toEqual({ label: "Unidade Sul", value: "south" });
    await expect(readSubmissionHistory()).resolves.toEqual([record]);
  });

  it("não grava unidade quando o seletor ficou sem opção ou não é de unidade", async () => {
    mockPageResult({
      ok: true,
      result: {
        unfilledFields: [],
        values: { unit: { label: "Selecione a unidade", value: "" } },
      },
    });
    const empty = await submitTestLead(page, unitForm);
    const unmarked = await submitTestLead(page, form);
    expect(empty.record).not.toHaveProperty("unit");
    expect(unmarked.record).not.toHaveProperty("unit");
  });

  it("injeta o envio só no documento indicado", async () => {
    const executeScript = mockPageResult({
      ok: true,
      result: { unfilledFields: [], values: {} },
    });
    await submitTestLead(page, unitForm, { unit: "north" }, "document-1");
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      args: ["leadIntegrationTesterPageCommand", expect.any(Object)],
      func: expect.any(Function),
      target: { documentIds: ["document-1"], tabId: 7 },
    });
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      files: ["/lead-forms.js"],
      target: { documentIds: ["document-1"], tabId: 7 },
    });
  });

  it("devolve o formulário quando a aba, o endereço e o documento continuam os mesmos", async () => {
    const executeScript = mockPageResult({ ok: true, result: [unitForm] });
    vi.spyOn(tabs, "get").mockResolvedValue({
      active: true,
      id: 7,
      url: page.pageUrl,
    });
    await expect(
      findUnchangedForm(
        { ...page, documentId: "document", forms: [unitForm] },
        unitForm,
      ),
    ).resolves.toEqual(unitForm);
    expect(executeScript).toHaveBeenCalledWith({
      files: ["/lead-forms.js"],
      target: { documentIds: ["document"], tabId: 7 },
    });
  });

  it.each([
    [
      "a aba deixou de ser a ativa",
      { active: false, url: page.pageUrl },
      [unitForm],
    ],
    [
      "o endereço mudou",
      { active: true, url: page.pageUrl + "#obrigado" },
      [unitForm],
    ],
    ["o formulário sumiu", { active: true, url: page.pageUrl }, []],
    [
      "o formulário no mesmo índice é outro",
      { active: true, url: page.pageUrl },
      [{ ...unitForm, label: "Outro formulário" }],
    ],
  ])("não devolve o formulário quando %s", async (_reason, tab, forms) => {
    mockPageResult({ ok: true, result: forms });
    vi.spyOn(tabs, "get").mockResolvedValue({ id: 7, ...tab });
    await expect(
      findUnchangedForm(
        { ...page, documentId: "document", forms: [unitForm] },
        unitForm,
      ),
    ).resolves.toBeUndefined();
  });

  it("não devolve o formulário quando o documento foi trocado ou não é conhecido", async () => {
    vi.spyOn(tabs, "get").mockResolvedValue({
      active: true,
      id: 7,
      url: page.pageUrl,
    });
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockRejectedValue(new Error("No document with id document."));
    await expect(
      findUnchangedForm(
        { ...page, documentId: "document", forms: [unitForm] },
        unitForm,
      ),
    ).resolves.toBeUndefined();
    executeScript.mockClear();
    await expect(
      findUnchangedForm({ ...page, forms: [unitForm] }, unitForm),
    ).resolves.toBeUndefined();
    expect(executeScript).not.toHaveBeenCalled();
  });
});
