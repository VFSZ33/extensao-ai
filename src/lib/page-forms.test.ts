import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Browser, browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { RecognizedForm } from "@/lib/page-command";

import { createLeadData } from "@/lib/lead-data";
import {
  detectPageForms,
  findUnchangedForm,
  isSameForm,
  PAGE_COMMAND_TIMEOUT_MS,
  PAGE_LOAD_POLL_MS,
  PAGE_LOAD_TIMEOUT_MS,
  type PageForms,
  reopenFormPage,
  returnToForm,
  submitTestLead,
  waitForPageChange,
} from "@/lib/page-forms";
import { readSubmissionHistory } from "@/lib/submission-history";

const form: RecognizedForm = {
  definitionId: "autodromo-offer",
  definitionName: "Formulário de oferta",
  index: 2,
  label: "oferta - GEELY EX5 PRO - Enviar",
  marks: {},
  selects: [
    {
      key: "unit",
      label: "Unidade",
      options: [{ label: "Unidade Norte", value: "north" }],
    },
  ],
};
const page = { pageUrl: "https://example.com/oferta", tabId: 7 };
const permissions: {
  contains: (permissions: object) => Promise<boolean>;
} = browser.permissions;
const tabs: {
  get: (tabId: number) => Promise<object>;
  query: (query: object) => Promise<object[]>;
  update: (tabId: number, properties: object) => Promise<object | undefined>;
} = browser.tabs;
const unitForm: RecognizedForm = {
  ...form,
  definitionId: "autodromo-section",
  definitionName: "Formulário de seção",
  marks: { accountId: "account", channel: "Seminovos", siteId: "site" },
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

function mockPageResult(result: unknown, documentId = "document") {
  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async (injection) => [
      {
        documentId,
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
    ).resolves.toEqual({ form: unitForm, status: "found" });
    expect(executeScript).toHaveBeenCalledWith({
      files: ["/lead-forms.js"],
      target: { documentIds: ["document"], tabId: 7 },
    });
  });

  it("devolve o formulário remontado, com outro elemento, mas a mesma definição e as mesmas marcas", async () => {
    const remounted = {
      ...unitForm,
      marks: { accountId: "account", channel: "Seminovos", siteId: "site" },
      selects: [{ ...unitForm.selects[0], options: [] }],
    };
    mockPageResult({ ok: true, result: [remounted] });
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
    ).resolves.toEqual({ form: remounted, status: "found" });
  });

  it.each([
    [
      "a aba deixou de ser a ativa",
      { active: false, url: page.pageUrl },
      [unitForm],
      "inactive",
    ],
    [
      "o endereço mudou",
      { active: true, url: page.pageUrl + "#obrigado" },
      [unitForm],
      "moved",
    ],
    [
      "a aba está navegando para outro endereço",
      {
        active: true,
        pendingUrl: "https://example.com/obrigado",
        url: page.pageUrl,
      },
      [unitForm],
      "navigating",
    ],
    ["o formulário sumiu", { active: true, url: page.pageUrl }, [], "missing"],
    [
      "o formulário no mesmo índice é outro",
      { active: true, url: page.pageUrl },
      [{ ...unitForm, label: "Outro formulário" }],
      "missing",
    ],
    [
      "o formulário no mesmo índice tem outra marca",
      { active: true, url: page.pageUrl },
      [{ ...unitForm, marks: { ...unitForm.marks, siteId: "outro-site" } }],
      "missing",
    ],
    [
      "o formulário no mesmo índice tem uma marca a mais",
      { active: true, url: page.pageUrl },
      [{ ...unitForm, marks: { ...unitForm.marks, teamId: "team" } }],
      "missing",
    ],
    [
      "o formulário com as mesmas marcas está em outro índice",
      { active: true, url: page.pageUrl },
      [{ ...unitForm, index: unitForm.index + 1 }],
      "missing",
    ],
  ])(
    "não devolve o formulário quando %s",
    async (_reason, tab, forms, status) => {
      mockPageResult({ ok: true, result: forms });
      vi.spyOn(tabs, "get").mockResolvedValue({ id: 7, ...tab });
      await expect(
        findUnchangedForm(
          { ...page, documentId: "document", forms: [unitForm] },
          unitForm,
        ),
      ).resolves.toEqual({ status });
    },
  );

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
    ).resolves.toEqual({ status: "inaccessible" });
    executeScript.mockClear();
    await expect(
      findUnchangedForm({ ...page, forms: [unitForm] }, unitForm),
    ).resolves.toEqual({ status: "inaccessible" });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("não considera o mesmo formulário quando falta uma marca dos dois lados", () => {
    expect(isSameForm(unitForm, unitForm)).toBe(true);
    expect(isSameForm({ ...unitForm, marks: {} }, unitForm)).toBe(false);
    expect(isSameForm(unitForm, { ...unitForm, marks: {} })).toBe(false);
  });

  it("pede o retorno ao formulário só no documento da detecção e devolve o resultado da página", async () => {
    const executeScript = mockPageResult({ ok: true, result: "returned" });
    await expect(
      returnToForm(
        { ...page, documentId: "document", forms: [unitForm] },
        unitForm,
      ),
    ).resolves.toBe("returned");
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      args: [
        "leadIntegrationTesterPageCommand",
        {
          definitionId: "autodromo-section",
          index: 2,
          type: "return-to-form",
        },
      ],
      func: expect.any(Function),
      target: { documentIds: ["document"], tabId: 7 },
    });
    executeScript.mockClear();
    await expect(
      returnToForm({ ...page, forms: [unitForm] }, unitForm),
    ).resolves.toBe("unknown-form");
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("rejeita um resultado desconhecido do retorno ao formulário", async () => {
    mockPageResult({ ok: true, result: "clicked" });
    await expect(
      returnToForm(
        { ...page, documentId: "document", forms: [unitForm] },
        unitForm,
      ),
    ).rejects.toThrow("A página retornou uma resposta inválida.");
  });
});

describe("Volta ao endereço do formulário", () => {
  const formUrl = "https://example.com/oferta?filter%5Bunit%5D=north";
  const formPage: PageForms = {
    documentId: "document",
    forms: [unitForm],
    pageUrl: formUrl,
    tabId: 7,
  };
  const loaded = { active: true, id: 7, status: "complete", url: formUrl };
  const thanks = {
    ...loaded,
    url: "https://example.com/obrigado?filter%5Bunit%5D=north",
  };

  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("leva a mesma aba de volta ao endereço exato, espera carregar e devolve o formulário no documento novo", async () => {
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce(thanks)
      .mockResolvedValueOnce({ ...loaded, status: "loading" })
      .mockResolvedValue(loaded);
    const update = vi.spyOn(tabs, "update").mockResolvedValue({});
    const executeScript = mockPageResult(
      { ok: true, result: [unitForm] },
      "document-2",
    );
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      form: unitForm,
      page: { ...formPage, documentId: "document-2" },
      status: "found",
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(7, { url: formUrl });
    expect(executeScript).toHaveBeenCalledWith({
      files: ["/lead-forms.js"],
      target: { tabId: 7 },
    });
  });

  it("espera a navegação pendente terminar e não navega quando a aba já está no endereço do formulário", async () => {
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce({ ...loaded, pendingUrl: formUrl })
      .mockResolvedValue(loaded);
    const update = vi.spyOn(tabs, "update");
    const twin = { ...unitForm, index: unitForm.index + 1 };
    mockPageResult({ ok: true, result: [unitForm, twin] }, "document-2");
    await expect(
      reopenFormPage({ ...formPage, forms: [unitForm, twin] }, unitForm),
    ).resolves.toMatchObject({ form: unitForm, status: "found" });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a navegação pendente vai para outro site",
      { ...loaded, pendingUrl: "https://outro.example/obrigado" },
    ],
    [
      "a página carregada é de outro site",
      { ...loaded, url: "https://outro.example/obrigado" },
    ],
    [
      "a página carregada é de outro protocolo",
      { ...loaded, url: "http://example.com/obrigado" },
    ],
  ])("para sem navegar quando %s", async (_reason, tab) => {
    vi.spyOn(tabs, "get").mockResolvedValue(tab);
    const update = vi.spyOn(tabs, "update");
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status: "other-site",
    });
    expect(update).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("para quando a aba é fechada, deixa de ser a ativa ou não aceita a navegação", async () => {
    const get = vi
      .spyOn(tabs, "get")
      .mockRejectedValueOnce(new Error("No tab with id: 7."))
      .mockResolvedValueOnce({ ...thanks, active: false })
      .mockResolvedValue(thanks);
    vi.spyOn(tabs, "update").mockRejectedValue(new Error("No tab with id: 7."));
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status: "inactive",
    });
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status: "inactive",
    });
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status: "inactive",
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["a página não termina de carregar", { ...loaded, status: "loading" }],
    ["a aba não chega ao endereço do formulário", thanks],
  ])("para quando %s no prazo", async (_reason, tab) => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });

    try {
      vi.spyOn(tabs, "get").mockResolvedValue(tab);
      vi.spyOn(tabs, "update").mockResolvedValue({});
      const executeScript = vi.spyOn(browser.scripting, "executeScript");
      const result = reopenFormPage(formPage, unitForm);
      await vi.advanceTimersByTimeAsync(
        PAGE_LOAD_TIMEOUT_MS - PAGE_LOAD_POLL_MS,
      );
      await expect(
        Promise.race([result, Promise.resolve("esperando")]),
      ).resolves.toBe("esperando");
      await vi.advanceTimersByTimeAsync(PAGE_LOAD_POLL_MS * 2);
      await expect(result).resolves.toEqual({ status: "timeout" });
      expect(executeScript).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("diferencia a falta de acesso ao site de uma página que não responde", async () => {
    vi.spyOn(tabs, "get").mockResolvedValue(loaded);
    vi.spyOn(browser.scripting, "executeScript").mockRejectedValue(
      new Error("Cannot access contents of the page."),
    );
    const contains = vi.spyOn(permissions, "contains").mockResolvedValue(false);
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status: "denied",
    });
    contains.mockResolvedValue(true);
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status: "inaccessible",
    });
    expect(contains).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
  });

  it.each([
    ["o formulário não voltou", [], "missing"],
    [
      "voltou outro formulário no lugar",
      [{ ...unitForm, label: "Outro formulário" }],
      "missing",
    ],
    [
      "voltou um formulário com outra marca",
      [{ ...unitForm, marks: { ...unitForm.marks, siteId: "outro-site" } }],
      "missing",
    ],
    [
      "o formulário voltou em outra posição",
      [{ ...unitForm, index: unitForm.index + 1 }],
      "ambiguous",
    ],
    [
      "o formulário voltou repetido",
      [unitForm, { ...unitForm, index: unitForm.index + 1 }],
      "ambiguous",
    ],
  ])("para quando %s", async (_reason, forms, status) => {
    vi.spyOn(tabs, "get").mockResolvedValue(loaded);
    mockPageResult({ ok: true, result: forms }, "document-2");
    await expect(reopenFormPage(formPage, unitForm)).resolves.toEqual({
      status,
    });
  });
});

describe("Espera pela saída da página depois do envio", () => {
  const formUrl = "https://example.com/oferta?filter%5Bunit%5D=north";
  const formPage = { pageUrl: formUrl, tabId: 7 };
  const loaded = { active: true, id: 7, status: "complete", url: formUrl };

  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ["setTimeout"] });

    return () => {
      vi.useRealTimers();
    };
  });

  it.each([
    [
      "o site leva a aba a outro endereço",
      { ...loaded, url: "https://example.com/obrigado" },
    ],
    [
      "o site começa uma navegação",
      { ...loaded, pendingUrl: "https://example.com/obrigado" },
    ],
  ])(
    "percebe, sem agir na página, quando %s depois que o formulário parecia pronto",
    async (_reason, tab) => {
      const get = vi
        .spyOn(tabs, "get")
        .mockResolvedValueOnce(loaded)
        .mockResolvedValueOnce(loaded)
        .mockResolvedValue(tab);
      const executeScript = vi.spyOn(browser.scripting, "executeScript");
      const change = waitForPageChange(formPage, PAGE_LOAD_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(PAGE_LOAD_POLL_MS * 2);
      await expect(change).resolves.toBe("changed");
      expect(get).toHaveBeenCalledTimes(3);
      expect(executeScript).not.toHaveBeenCalled();
    },
  );

  it("devolve que a página ficou no endereço quando o prazo acaba", async () => {
    vi.spyOn(tabs, "get").mockResolvedValue(loaded);
    const change = waitForPageChange(formPage, PAGE_LOAD_POLL_MS * 4);
    await vi.advanceTimersByTimeAsync(PAGE_LOAD_POLL_MS * 3);
    await expect(
      Promise.race([change, Promise.resolve("esperando")]),
    ).resolves.toBe("esperando");
    await vi.advanceTimersByTimeAsync(PAGE_LOAD_POLL_MS);
    await expect(change).resolves.toBe("unchanged");
  });

  it("para quando a aba é fechada ou deixa de ser a ativa e quando a espera é cancelada", async () => {
    vi.spyOn(tabs, "get")
      .mockRejectedValueOnce(new Error("No tab with id: 7."))
      .mockResolvedValueOnce({ ...loaded, active: false })
      .mockResolvedValue(loaded);
    await expect(
      waitForPageChange(formPage, PAGE_LOAD_TIMEOUT_MS),
    ).resolves.toBe("inactive");
    await expect(
      waitForPageChange(formPage, PAGE_LOAD_TIMEOUT_MS),
    ).resolves.toBe("inactive");
    const controller = new AbortController();
    const change = waitForPageChange(
      formPage,
      PAGE_LOAD_TIMEOUT_MS,
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(PAGE_LOAD_POLL_MS);
    controller.abort();
    await vi.advanceTimersByTimeAsync(PAGE_LOAD_POLL_MS);
    await expect(change).resolves.toBe("cancelled");
  });
});

describe("Comandos na página", () => {
  const formPage: PageForms = {
    documentId: "document",
    forms: [unitForm],
    pageUrl: "https://example.com/oferta?filter%5Bunit%5D=north",
    tabId: 7,
  };
  const tab: Browser.tabs.Tab = {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: 7,
    incognito: false,
    index: 0,
    lastAccessed: 0,
    pinned: false,
    selected: true,
    windowId: 1,
  };

  beforeEach(() => {
    fakeBrowser.reset();
  });

  function mockFrozenPage() {
    let frozen = true;
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async (injection) =>
        "files" in injection && frozen
          ? new Promise<never>(() => undefined)
          : [
              {
                documentId: "document",
                frameId: 0,
                result:
                  "files" in injection
                    ? { ok: true, result: [unitForm] }
                    : undefined,
              },
            ],
      );
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: formPage.pageUrl },
    ]);

    return {
      executeScript,
      thaw: () => {
        frozen = false;
      },
    };
  }

  it("termina o comando quando a aba navega para outro endereço e libera a aba para o próximo", async () => {
    const { thaw } = mockFrozenPage();
    const returned = returnToForm(formPage, unitForm);
    await vi.waitFor(() =>
      expect(browser.scripting.executeScript).toHaveBeenCalledTimes(2),
    );
    await fakeBrowser.tabs.onUpdated.trigger(
      7,
      { url: "https://example.com/obrigado?filter%5Bunit%5D=north" },
      { ...tab, url: "https://example.com/obrigado" },
    );
    await expect(returned).rejects.toThrow(
      "A página mudou de endereço antes de responder.",
    );
    thaw();
    await expect(detectPageForms()).resolves.toMatchObject({
      forms: [unitForm],
    });
  });

  it("não termina o comando quando só a âncora do endereço muda", async () => {
    mockFrozenPage();
    vi.spyOn(tabs, "get").mockResolvedValue({
      ...tab,
      url: formPage.pageUrl,
    });
    const detected = findUnchangedForm(formPage, unitForm);
    await vi.waitFor(() =>
      expect(browser.scripting.executeScript).toHaveBeenCalledTimes(2),
    );
    await fakeBrowser.tabs.onUpdated.trigger(
      7,
      { url: formPage.pageUrl + "#obrigado" },
      { ...tab, url: formPage.pageUrl + "#obrigado" },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(
      Promise.race([detected, Promise.resolve("esperando")]),
    ).resolves.toBe("esperando");
    await fakeBrowser.tabs.onUpdated.trigger(
      7,
      { url: "https://example.com/obrigado" },
      { ...tab, url: "https://example.com/obrigado" },
    );
    await expect(detected).resolves.toEqual({ status: "inaccessible" });
  });

  it("termina o comando quando a aba é fechada ou a ação é cancelada", async () => {
    mockFrozenPage();
    const closed = returnToForm(formPage, unitForm);
    await vi.waitFor(() =>
      expect(browser.scripting.executeScript).toHaveBeenCalledTimes(2),
    );
    await fakeBrowser.tabs.onRemoved.trigger(7, {
      isWindowClosing: false,
      windowId: 1,
    });
    await expect(closed).rejects.toThrow(
      "A aba foi fechada antes de a página responder.",
    );
    const controller = new AbortController();
    const cancelled = returnToForm(formPage, unitForm, controller.signal);
    await vi.waitFor(() =>
      expect(browser.scripting.executeScript).toHaveBeenCalledTimes(4),
    );
    controller.abort();
    await expect(cancelled).rejects.toThrow("A ação na página foi cancelada.");
  });

  it("termina o comando no prazo quando a página não responde", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      mockFrozenPage();
      const returned = returnToForm(formPage, unitForm);
      const rejected = expect(returned).rejects.toThrow(
        "A página não respondeu em 30 s.",
      );
      await vi.advanceTimersByTimeAsync(PAGE_COMMAND_TIMEOUT_MS);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  it("não mistura os comandos de duas ações simultâneas na mesma aba", async () => {
    const calls: string[] = [];
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7, url: page.pageUrl }]);
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async (injection) => {
        const stored: unknown = "args" in injection && injection.args?.[1];
        const type =
          typeof stored === "object" && stored !== null && "type" in stored
            ? String(stored.type)
            : "arquivo";
        calls.push(type);

        if (type === "submit-form") {
          await blocked;
        }

        return [
          {
            documentId: "document",
            frameId: 0,
            result:
              "files" in injection
                ? {
                    ok: true,
                    result:
                      calls.at(-2) === "detect-forms"
                        ? [unitForm]
                        : { unfilledFields: [], values: {} },
                  }
                : undefined,
          },
        ];
      },
    );
    const submission = submitTestLead(page, unitForm);
    await vi.waitFor(() => expect(calls).toEqual(["submit-form"]));
    const detection = detectPageForms();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual(["submit-form"]);
    release();
    await expect(submission).resolves.toMatchObject({ unfilledFields: [] });
    await expect(detection).resolves.toMatchObject({ forms: [unitForm] });
    expect(calls).toEqual([
      "submit-form",
      "arquivo",
      "detect-forms",
      "arquivo",
    ]);
  });
});
