import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Browser, browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { RecognizedForm } from "@/lib/page-command";

import { PAGE_LOAD_TIMEOUT_MS, type PageForms } from "@/lib/page-forms";
import { readSubmissionHistory } from "@/lib/submission-history";
import {
  listPendingUnits,
  runSubmissionQueue,
  type SubmissionQueue,
  type SubmissionQueueOptions,
} from "@/lib/submission-queue";

type Command = { selections?: Record<string, string>; type: string };

type SiteTab = {
  active: boolean;
  id: number;
  pendingUrl?: string;
  status: string;
  url: string;
};

const form: RecognizedForm = {
  definitionId: "autodromo-section",
  definitionName: "Formulário de seção",
  index: 4,
  label: "CRETA 1.0 TGDI FLEX COMFORT - Enviar",
  marks: { accountId: "account", channel: "Seminovos", siteId: "site" },
  selects: [
    {
      key: "bestTime",
      label: "Melhor horário",
      options: [{ label: "Manhã", value: "morning" }],
    },
    {
      key: "unit",
      label: "Unidade",
      options: [
        { label: "Unidade Leste", value: "east" },
        { label: "Unidade Norte", value: "north" },
        { label: "Unidade Sul", value: "south" },
      ],
      unit: true,
    },
  ],
};
const page: PageForms = {
  documentId: "document",
  forms: [form],
  pageUrl: "https://example.com/veiculo",
  tabId: 7,
};
const permissions: {
  contains: (permissions: object) => Promise<boolean>;
} = browser.permissions;
const tabs: {
  get: (tabId: number) => Promise<object>;
  update: (
    tabId: number,
    properties: { url?: string },
  ) => Promise<object | undefined>;
} = browser.tabs;
const eventTab: Browser.tabs.Tab = {
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
const thanksUrl = "https://example.com/obrigado?filter%5Bunit%5D=east";
const unitPage: PageForms = {
  ...page,
  pageUrl: "https://example.com/veiculo?filter%5Bunit%5D=east",
};
const units = form.selects[1]?.options ?? [];

function isCommand(value: unknown): value is Command {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function mockQueuePage({
  back = () => ({ ok: true, result: "form-present" }),
  detect = () => [form],
  submit = (command) => ({
    ok: true,
    result: {
      unfilledFields: [],
      values: {
        unit: units.find(({ value }) => value === command.selections?.unit) ?? {
          label: "",
          value: "",
        },
      },
    },
  }),
}: {
  back?: (returned: number) => unknown;
  detect?: (submitted: number, returned: number) => unknown;
  submit?: (command: Command, submitted: number) => unknown;
} = {}) {
  const commands: Command[] = [];
  let command: Command | undefined;
  let returned = 0;
  let submitted = 0;
  const executeScript = vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async (injection) => {
      if ("args" in injection) {
        const stored: unknown = injection.args?.[1];
        command = isCommand(stored) ? stored : undefined;

        return [{ documentId: "document", frameId: 0, result: undefined }];
      }

      if (!command) {
        throw new Error("Comando ausente.");
      }

      commands.push(command);

      if (command.type === "return-to-form") {
        returned += 1;

        return [
          {
            documentId: "document",
            frameId: 0,
            result: await back(returned),
          },
        ];
      }

      if (command.type === "detect-forms") {
        const forms = detect(submitted, returned);

        return [
          {
            documentId: "document",
            frameId: 0,
            result: { ok: true, result: forms },
          },
        ];
      }

      submitted += 1;

      return [
        {
          documentId: "document",
          frameId: 0,
          result: await submit(command, submitted),
        },
      ];
    });
  vi.spyOn(tabs, "get").mockResolvedValue({
    active: true,
    id: 7,
    url: page.pageUrl,
  });

  return { commands, executeScript };
}

function mockSite({
  access = true,
  back = false,
  detect = (documentId) => (documentId.startsWith("obrigado") ? [] : [form]),
  onFreeze,
  onUpdate = () => undefined,
  pending = false,
  redirectOn = "submit",
  redirectTo = thanksUrl,
  sameDocument = false,
}: {
  access?: boolean;
  back?: boolean;
  detect?: (documentId: string) => RecognizedForm[];
  onFreeze?: () => void;
  onUpdate?: (tab: SiteTab) => void;
  pending?: boolean;
  redirectOn?: "frozen" | "return" | "submit";
  redirectTo?: string;
  sameDocument?: boolean;
} = {}) {
  const commands: [string, string][] = [];
  const tab: SiteTab = {
    active: true,
    id: 7,
    status: "complete",
    url: unitPage.pageUrl,
  };
  let command: Command | undefined;
  let documentId = "document";
  let loads = 0;
  let pendingDocument = documentId;
  let submitted = 0;

  function redirect() {
    const next = sameDocument ? documentId : "obrigado-" + submitted;

    if (pending) {
      tab.pendingUrl = redirectTo;
      tab.status = "loading";
      pendingDocument = next;
    } else {
      tab.url = redirectTo;
      documentId = next;
    }
  }

  vi.spyOn(browser.scripting, "executeScript").mockImplementation(
    async (injection) => {
      const targeted =
        "documentIds" in injection.target
          ? injection.target.documentIds?.[0]
          : undefined;

      if (targeted !== undefined && targeted !== documentId) {
        throw new Error("No document with id " + targeted + ".");
      }

      if (!access && documentId !== "document") {
        throw new Error("Cannot access contents of the page.");
      }

      if ("args" in injection) {
        const stored: unknown = injection.args?.[1];
        command = isCommand(stored) ? stored : undefined;

        return [{ documentId, frameId: 0, result: undefined }];
      }

      if (!command) {
        throw new Error("Comando ausente.");
      }

      commands.push([command.type, documentId]);

      if (command.type === "detect-forms") {
        return [
          {
            documentId,
            frameId: 0,
            result: { ok: true, result: detect(documentId) },
          },
        ];
      }

      if (command.type === "return-to-form") {
        if (redirectOn === "return") {
          redirect();
          throw new Error("The frame was removed.");
        }

        if (redirectOn === "frozen") {
          redirect();
          setTimeout(
            onFreeze ??
              (() => {
                void fakeBrowser.tabs.onUpdated.trigger(
                  7,
                  { url: tab.url },
                  { ...eventTab, url: tab.url },
                );
              }),
            0,
          );

          return new Promise<never>(() => undefined);
        }

        return [
          {
            documentId,
            frameId: 0,
            result: { ok: true, result: "form-present" },
          },
        ];
      }

      submitted += 1;
      const unit = units.find(
        ({ value }) => value === command?.selections?.unit,
      );

      if (redirectOn === "submit") {
        redirect();
      }

      return [
        {
          documentId,
          frameId: 0,
          result: {
            ok: true,
            result: {
              unfilledFields: [],
              values: unit ? { unit } : {},
            },
          },
        },
      ];
    },
  );
  vi.spyOn(tabs, "get").mockImplementation(async () => {
    const current = { ...tab };

    if (tab.pendingUrl) {
      tab.url = tab.pendingUrl;
      tab.status = "complete";
      delete tab.pendingUrl;
      documentId = pendingDocument;
    } else if (back && tab.url === redirectTo) {
      tab.url = unitPage.pageUrl;
      documentId = "document";
    }

    return current;
  });
  const update = vi
    .spyOn(tabs, "update")
    .mockImplementation(async (_tabId, { url = "" }) => {
      loads += 1;
      tab.url = url;

      if (!sameDocument) {
        documentId = "form-" + loads;
      }

      onUpdate(tab);

      return { ...tab };
    });
  vi.spyOn(permissions, "contains").mockResolvedValue(access);

  return { commands, update };
}

function runQueue(options: Partial<SubmissionQueueOptions> = {}) {
  const changes: SubmissionQueue[] = [];
  const onSubmitted = vi.fn();

  return {
    changes,
    onSubmitted,
    result: runSubmissionQueue({
      form,
      interval: 0,
      onChange: (queue) => changes.push(queue),
      onSubmitted,
      page,
      selections: { bestTime: "morning" },
      signal: new AbortController().signal,
      units,
      ...options,
    }),
  };
}

describe("Fila de envios por unidade", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 8, 5, 9));
  });

  it("envia uma unidade por vez, em ordem, cada uma com identificador e registro próprios", async () => {
    const { commands, executeScript } = mockQueuePage();
    const { onSubmitted, result } = runQueue();
    const queue = await result;
    expect(queue.outcome).toBe("completed");
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "sent",
      "sent",
    ]);
    expect(commands.map(({ selections, type }) => [type, selections])).toEqual([
      ["detect-forms", undefined],
      ["submit-form", { bestTime: "morning", unit: "east" }],
      ["detect-forms", undefined],
      ["return-to-form", undefined],
      ["detect-forms", undefined],
      ["submit-form", { bestTime: "morning", unit: "north" }],
      ["detect-forms", undefined],
      ["return-to-form", undefined],
      ["detect-forms", undefined],
      ["submit-form", { bestTime: "morning", unit: "south" }],
    ]);
    expect(
      executeScript.mock.calls.every(
        ([injection]) =>
          JSON.stringify(injection.target) ===
          JSON.stringify({ documentIds: ["document"], tabId: 7 }),
      ),
    ).toBe(true);
    const history = await readSubmissionHistory();
    expect(history.map(({ id, unit }) => [id, unit?.label])).toEqual([
      ["LT-20261007-080509-003", "Unidade Sul"],
      ["LT-20261007-080509-002", "Unidade Norte"],
      ["LT-20261007-080509-001", "Unidade Leste"],
    ]);
    expect(
      new Set(
        history.map(({ values }) => JSON.stringify([values.unit, values.name])),
      ).size,
    ).toBe(3);
    expect(onSubmitted.mock.calls.map(([record]) => record?.id)).toEqual([
      "LT-20261007-080509-001",
      "LT-20261007-080509-002",
      "LT-20261007-080509-003",
    ]);
  });

  it("só confere e envia a próxima unidade depois que o envio anterior termina", async () => {
    const finishes: ((response: unknown) => void)[] = [];
    const { commands } = mockQueuePage({
      submit: (command) =>
        new Promise((resolve) => {
          finishes.push(() =>
            resolve({
              ok: true,
              result: {
                unfilledFields: [],
                values: {
                  unit: { label: "", value: command.selections?.unit ?? "" },
                },
              },
            }),
          );
        }),
    });
    const { changes, result } = runQueue({ units: units.slice(0, 2) });
    await vi.waitFor(() => expect(finishes).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(commands).toHaveLength(2);
    expect(changes.at(-1)?.items.map(({ status }) => status)).toEqual([
      "sending",
      "pending",
    ]);
    finishes[0]?.(undefined);
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    expect(commands).toHaveLength(6);
    finishes[1]?.(undefined);
    await expect(result).resolves.toMatchObject({ outcome: "completed" });
  });

  it("para e mantém as unidades pendentes quando a página vai para outro site depois de um envio", async () => {
    const { commands } = mockQueuePage();
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockResolvedValue({
        active: true,
        id: 7,
        status: "complete",
        url: "https://outro.example/obrigado",
      });
    const update = vi.spyOn(tabs, "update");
    const { onSubmitted, result } = runQueue();
    const queue = await result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      "A página foi para outro site depois do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
    );
    expect(update).not.toHaveBeenCalled();
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "pending",
      "pending",
    ]);
    expect(listPendingUnits(queue).map(({ label }) => label)).toEqual([
      "Unidade Norte",
      "Unidade Sul",
    ]);
    expect(commands.filter(({ type }) => type === "submit-form")).toHaveLength(
      1,
    );
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    await expect(readSubmissionHistory()).resolves.toHaveLength(1);
  });

  it("para quando a aba deixa de ser a ativa", async () => {
    mockQueuePage();
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockResolvedValue({ active: false, id: 7, url: page.pageUrl });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(listPendingUnits(queue)).toHaveLength(2);
  });

  it("volta ao endereço exato do formulário quando o site redireciona para a página de obrigado e segue para as próximas unidades", async () => {
    const { commands, update } = mockSite();
    const { onSubmitted, result } = runQueue({ page: unitPage });
    const queue = await result;
    expect(queue.outcome).toBe("completed");
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "sent",
      "sent",
    ]);
    expect(update.mock.calls).toEqual([
      [7, { url: unitPage.pageUrl }],
      [7, { url: unitPage.pageUrl }],
    ]);
    expect(commands).toEqual([
      ["detect-forms", "document"],
      ["submit-form", "document"],
      ["detect-forms", "form-1"],
      ["detect-forms", "form-1"],
      ["submit-form", "form-1"],
      ["detect-forms", "form-2"],
      ["detect-forms", "form-2"],
      ["submit-form", "form-2"],
    ]);
    expect(onSubmitted).toHaveBeenCalledTimes(3);
    const history = await readSubmissionHistory();
    expect(history.map(({ pageUrl, unit }) => [pageUrl, unit?.label])).toEqual([
      [unitPage.pageUrl, "Unidade Sul"],
      [unitPage.pageUrl, "Unidade Norte"],
      [unitPage.pageUrl, "Unidade Leste"],
    ]);
  });

  it("espera a navegação que o site começa depois do envio antes de voltar ao formulário", async () => {
    const { commands, update } = mockSite({ pending: true });
    const queue = await runQueue({ page: unitPage, units: units.slice(0, 2) })
      .result;
    expect(queue.outcome).toBe("completed");
    expect(update).toHaveBeenCalledTimes(1);
    expect(commands.map(([type]) => type)).not.toContain("return-to-form");
  });

  it("volta ao formulário quando o site redireciona enquanto a extensão espera o fim do envio", async () => {
    const { commands, update } = mockSite({ redirectOn: "return" });
    const queue = await runQueue({ page: unitPage, units: units.slice(0, 2) })
      .result;
    expect(queue.outcome).toBe("completed");
    expect(update).toHaveBeenCalledTimes(1);
    expect(commands).toEqual([
      ["detect-forms", "document"],
      ["submit-form", "document"],
      ["detect-forms", "document"],
      ["return-to-form", "document"],
      ["detect-forms", "form-1"],
      ["detect-forms", "form-1"],
      ["submit-form", "form-1"],
    ]);
  });

  it("volta ao formulário quando o site redireciona enquanto o retorno espera na página e o documento antigo fica congelado no cache", async () => {
    const { commands, update } = mockSite({ redirectOn: "frozen" });
    const queue = await runQueue({ page: unitPage, units: units.slice(0, 2) })
      .result;
    expect(queue.outcome).toBe("completed");
    expect(update).toHaveBeenCalledTimes(1);
    expect(commands).toEqual([
      ["detect-forms", "document"],
      ["submit-form", "document"],
      ["detect-forms", "document"],
      ["return-to-form", "document"],
      ["detect-forms", "form-1"],
      ["detect-forms", "form-1"],
      ["submit-form", "form-1"],
    ]);
  });

  it("cancela a fila enquanto o retorno espera numa página que não responde", async () => {
    const controller = new AbortController();
    const { commands } = mockSite({
      onFreeze: () => controller.abort(),
      redirectOn: "frozen",
    });
    const queue = await runQueue({ page: unitPage, signal: controller.signal })
      .result;
    expect(queue.outcome).toBe("cancelled");
    expect(listPendingUnits(queue)).toHaveLength(2);
    expect(commands.filter(([type]) => type === "submit-form")).toHaveLength(1);
  });

  it("segue quando a aba volta ao formulário restaurado do cache, sem carregar de novo", async () => {
    const { commands, update } = mockSite({ back: true });
    const queue = await runQueue({ page: unitPage, units: units.slice(0, 2) })
      .result;
    expect(queue.outcome).toBe("completed");
    expect(update).not.toHaveBeenCalled();
    expect(commands.map(([, documentId]) => documentId)).toEqual(
      Array(5).fill("document"),
    );
  });

  it("volta ao endereço do formulário quando só a âncora muda, no mesmo documento", async () => {
    const { commands, update } = mockSite({
      redirectTo: unitPage.pageUrl + "#obrigado",
      sameDocument: true,
    });
    const queue = await runQueue({ page: unitPage, units: units.slice(0, 2) })
      .result;
    expect(queue.outcome).toBe("completed");
    expect(update).toHaveBeenCalledExactlyOnceWith(7, {
      url: unitPage.pageUrl,
    });
    expect(commands.map(([, documentId]) => documentId)).toEqual(
      Array(5).fill("document"),
    );
  });

  it("segue quando a página é recarregada no mesmo endereço e o formulário volta num documento novo", async () => {
    const { commands, update } = mockSite({
      detect: () => [form],
      redirectTo: unitPage.pageUrl,
    });
    const queue = await runQueue({
      page: unitPage,
      units: units.slice(0, 2),
    }).result;
    expect(queue.outcome).toBe("completed");
    expect(update).not.toHaveBeenCalled();
    expect(commands).toEqual([
      ["detect-forms", "document"],
      ["submit-form", "document"],
      ["detect-forms", "obrigado-1"],
      ["detect-forms", "obrigado-1"],
      ["submit-form", "obrigado-1"],
    ]);
  });

  it.each([
    [
      "o formulário não aparece de novo",
      {
        detect: (documentId: string) =>
          documentId === "document" ? [form] : [],
      },
      "O formulário não apareceu depois que a extensão voltou ao endereço dele",
    ],
    [
      "o formulário aparece repetido",
      {
        detect: (documentId: string) =>
          documentId === "document" ? [form] : [form, { ...form, index: 5 }],
      },
      "O formulário apareceu em outra posição ou repetido depois que a extensão voltou ao endereço dele",
    ],
    [
      "a aba deixa de ser a ativa durante a volta",
      {
        onUpdate: (tab: SiteTab) => {
          tab.active = false;
        },
      },
      "A aba foi fechada ou deixou de ser a ativa depois do envio anterior",
    ],
    [
      "a volta ao endereço leva para outro site",
      {
        onUpdate: (tab: SiteTab) => {
          tab.url = "https://outro.example/";
        },
      },
      "A página foi para outro site depois do envio anterior",
    ],
  ])(
    "para e mostra as pendentes quando %s depois do redirecionamento",
    async (_reason, options, reason) => {
      const { commands } = mockSite(options);
      const { onSubmitted, result } = runQueue({ page: unitPage });
      const queue = await result;
      expect(queue.outcome).toBe("stopped");
      expect(queue.message).toBe(
        reason +
          ", e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      );
      expect(listPendingUnits(queue).map(({ label }) => label)).toEqual([
        "Unidade Norte",
        "Unidade Sul",
      ]);
      expect(commands.filter(([type]) => type === "submit-form")).toHaveLength(
        1,
      );
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    },
  );

  it("para e explica como liberar o acesso quando a extensão perde o acesso à página depois do redirecionamento", async () => {
    const { commands } = mockSite({ access: false });
    const queue = await runQueue({ page: unitPage }).result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      'A extensão perdeu o acesso à página depois que ela mudou de endereço, e a fila parou antes de Unidade Norte. Libere o acesso ao site em "Permitir acesso a este site", no painel lateral (o acesso temporário do clique no ícone pode acabar quando a aba muda de endereço), e atualize a lista para enviar às unidades pendentes.',
    );
    expect(listPendingUnits(queue)).toHaveLength(2);
    expect(commands.filter(([type]) => type === "submit-form")).toHaveLength(1);
  });

  it("para quando a página do formulário não termina de carregar no prazo", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });

    try {
      const { commands } = mockSite({
        onUpdate: (tab) => {
          tab.status = "loading";
        },
      });
      const { result } = runQueue({ page: unitPage });
      await vi.advanceTimersByTimeAsync(PAGE_LOAD_TIMEOUT_MS + 1000);
      const queue = await result;
      expect(queue.outcome).toBe("stopped");
      expect(queue.message).toBe(
        "A página do formulário não terminou de carregar em 15 s, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      );
      expect(listPendingUnits(queue)).toHaveLength(2);
      expect(commands.filter(([type]) => type === "submit-form")).toHaveLength(
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("não volta ao formulário quando a fila é cancelada durante o redirecionamento", async () => {
    const controller = new AbortController();
    const { commands } = mockSite({
      onUpdate: (tab) => {
        tab.status = "loading";
        controller.abort();
      },
    });
    const queue = await runQueue({ page: unitPage, signal: controller.signal })
      .result;
    expect(queue.outcome).toBe("cancelled");
    expect(listPendingUnits(queue)).toHaveLength(2);
    expect(commands.filter(([type]) => type === "submit-form")).toHaveLength(1);
  });

  it("volta ao formulário pela tela de sucesso depois de cada envio e segue para a próxima unidade", async () => {
    const { commands } = mockQueuePage({
      back: () => ({ ok: true, result: "returned" }),
      detect: (submitted, returned) =>
        submitted === returned
          ? [{ ...form, marks: { ...form.marks } }]
          : [{ ...form, index: 0, label: "Busca", marks: {} }],
    });
    const { onSubmitted, result } = runQueue();
    const queue = await result;
    expect(queue.outcome).toBe("completed");
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "sent",
      "sent",
    ]);
    expect(commands.map(({ selections, type }) => [type, selections])).toEqual([
      ["detect-forms", undefined],
      ["submit-form", { bestTime: "morning", unit: "east" }],
      ["detect-forms", undefined],
      ["return-to-form", undefined],
      ["detect-forms", undefined],
      ["submit-form", { bestTime: "morning", unit: "north" }],
      ["detect-forms", undefined],
      ["return-to-form", undefined],
      ["detect-forms", undefined],
      ["submit-form", { bestTime: "morning", unit: "south" }],
    ]);
    expect(onSubmitted).toHaveBeenCalledTimes(3);
    await expect(readSubmissionHistory()).resolves.toHaveLength(3);
  });

  it("não tenta voltar ao formulário antes do primeiro envio", async () => {
    const { commands } = mockQueuePage({
      back: () => ({ ok: true, result: "returned" }),
      detect: () => [],
    });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(commands.map(({ type }) => type)).toEqual(["detect-forms"]);
  });

  it.each([
    [
      "missing-button",
      'O formulário saiu da página depois do envio anterior, sem o botão "Voltar para o formulário" no lugar dele',
    ],
    [
      "timeout",
      'O formulário não voltou em 5 s depois do clique em "Voltar para o formulário"',
    ],
    [
      "ambiguous-button",
      'Há mais de um botão "Voltar para o formulário" onde estava o formulário enviado',
    ],
    [
      "ambiguous-form",
      'Mais de um formulário apareceu depois do clique em "Voltar para o formulário"',
    ],
    [
      "missing-region",
      "O formulário saiu da página depois do envio anterior, junto com a área onde ele estava",
    ],
    ["busy", "O site não terminou o envio anterior em 15 s"],
  ])(
    "para e mostra as pendentes quando o retorno ao formulário termina em %s",
    async (outcome, reason) => {
      const { commands } = mockQueuePage({
        back: () => ({ ok: true, result: outcome }),
        detect: (submitted) => (submitted === 0 ? [form] : []),
      });
      const { onSubmitted, result } = runQueue();
      const queue = await result;
      expect(queue.outcome).toBe("stopped");
      expect(queue.message).toBe(
        reason +
          ", e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      );
      expect(listPendingUnits(queue).map(({ label }) => label)).toEqual([
        "Unidade Norte",
        "Unidade Sul",
      ]);
      expect(commands.map(({ type }) => type)).toEqual([
        "detect-forms",
        "submit-form",
        "detect-forms",
        "return-to-form",
      ]);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["form-present", "O formulário mudou depois do envio anterior"],
    ["unknown-form", "O formulário saiu da página depois do envio anterior"],
  ])(
    "confere de novo e para quando o retorno termina em %s e o formulário não está na página",
    async (outcome, reason) => {
      const { commands } = mockQueuePage({
        back: () => ({ ok: true, result: outcome }),
        detect: (submitted) => (submitted === 0 ? [form] : []),
      });
      const queue = await runQueue().result;
      expect(queue.outcome).toBe("stopped");
      expect(queue.message).toBe(
        reason +
          ", e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      );
      expect(commands.map(({ type }) => type)).toEqual([
        "detect-forms",
        "submit-form",
        "detect-forms",
        "return-to-form",
        "detect-forms",
      ]);
    },
  );

  it("espera o site terminar o envio anterior antes de conferir o formulário e enviar a próxima unidade", async () => {
    const order: string[] = [];
    const { commands } = mockQueuePage({
      back: () => {
        order.push("retorno");

        return { ok: true, result: "form-present" };
      },
      submit: (command) => {
        order.push("envio " + (command.selections?.unit ?? ""));

        return {
          ok: true,
          result: { unfilledFields: [], values: {} },
        };
      },
    });
    const queue = await runQueue({ units: units.slice(0, 2) }).result;
    expect(queue.outcome).toBe("completed");
    expect(order).toEqual(["envio east", "retorno", "envio north"]);
    expect(commands.map(({ type }) => type)).toEqual([
      "detect-forms",
      "submit-form",
      "detect-forms",
      "return-to-form",
      "detect-forms",
      "submit-form",
    ]);
  });

  it("para quando o formulário que voltou não tem as mesmas marcas", async () => {
    const { commands } = mockQueuePage({
      back: () => ({ ok: true, result: "returned" }),
      detect: (submitted, returned) =>
        submitted === 0
          ? [form]
          : returned === 0
            ? []
            : [{ ...form, marks: { ...form.marks, siteId: "outro-site" } }],
    });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      'O formulário que voltou depois do clique em "Voltar para o formulário" não é o mesmo do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.',
    );
    expect(listPendingUnits(queue)).toHaveLength(2);
    expect(commands.filter(({ type }) => type === "submit-form")).toHaveLength(
      1,
    );
  });

  it("para quando a página vai para outro site depois do clique em voltar ao formulário", async () => {
    mockQueuePage({
      back: () => ({ ok: true, result: "returned" }),
      detect: (submitted) => (submitted === 0 ? [form] : []),
    });
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockResolvedValue({
        active: true,
        id: 7,
        status: "complete",
        url: "https://outro.example/obrigado",
      });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      "A página foi para outro site depois do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
    );
    expect(listPendingUnits(queue)).toHaveLength(2);
  });

  it("para quando a aba é fechada durante o retorno ao formulário", async () => {
    mockQueuePage({
      back: () => {
        throw new Error("No document with id document.");
      },
      detect: (submitted) => (submitted === 0 ? [form] : []),
    });
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockRejectedValue(new Error("No tab with id: 7."));
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      "A aba foi fechada ou deixou de ser a ativa depois do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
    );
    expect(listPendingUnits(queue)).toHaveLength(2);
  });

  it("para quando o formulário some e a página dá uma resposta inválida ao retorno", async () => {
    mockQueuePage({
      back: () => ({ ok: true, result: "clicked" }),
      detect: (submitted) => (submitted === 0 ? [form] : []),
    });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      "O formulário saiu da página depois do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
    );
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "pending",
      "pending",
    ]);
  });

  it("não envia a próxima unidade quando a fila é cancelada durante o retorno ao formulário", async () => {
    const controller = new AbortController();
    const { commands } = mockQueuePage({
      back: () => {
        controller.abort();

        return { ok: true, result: "returned" };
      },
      detect: (submitted, returned) => (submitted === returned ? [form] : []),
    });
    const queue = await runQueue({ signal: controller.signal }).result;
    expect(queue.outcome).toBe("cancelled");
    expect(listPendingUnits(queue)).toHaveLength(2);
    expect(commands.filter(({ type }) => type === "submit-form")).toHaveLength(
      1,
    );
  });

  it("para antes do primeiro envio quando a página já mudou desde a busca", async () => {
    const { commands } = mockQueuePage({ detect: () => [] });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toMatch(
      /^A página mudou desde a busca dos formulários, e a fila parou antes de Unidade Leste/,
    );
    expect(listPendingUnits(queue)).toHaveLength(3);
    expect(commands.filter(({ type }) => type === "submit-form")).toHaveLength(
      0,
    );
  });

  it("para quando a unidade seguinte não está mais no seletor da página", async () => {
    mockQueuePage({
      detect: (submitted) =>
        submitted === 0
          ? [form]
          : [
              {
                ...form,
                selects: [
                  form.selects[0],
                  { ...form.selects[1], options: units.slice(0, 1) },
                ],
              },
            ],
    });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      "A unidade Unidade Norte não está mais no seletor da página, e a fila parou. Atualize a lista para enviar às unidades pendentes.",
    );
    expect(listPendingUnits(queue)).toHaveLength(2);
  });

  it("para depois de um envio que falha, sem contar a falha como envio", async () => {
    mockQueuePage({
      submit: (command, submitted) =>
        submitted === 2
          ? { error: "O botão de envio está desabilitado.", ok: false }
          : {
              ok: true,
              result: {
                unfilledFields: ["city"],
                values: {
                  unit: units.find(
                    ({ value }) => value === command.selections?.unit,
                  ) ?? { label: "", value: "" },
                },
              },
            },
    });
    const { onSubmitted, result } = runQueue();
    const queue = await result;
    expect(queue.outcome).toBe("failed");
    expect(queue.message).toBe(
      "O envio para Unidade Norte falhou, e a fila parou para não seguir com a página num estado desconhecido.",
    );
    expect(queue.items).toEqual([
      expect.objectContaining({ status: "sent", unfilledFields: ["city"] }),
      {
        message: "O botão de envio está desabilitado.",
        status: "failed",
        unit: units[1],
      },
      { status: "pending", unit: units[2] },
    ]);
    expect(onSubmitted.mock.calls.map(([record]) => record?.id)).toEqual([
      "LT-20261007-080509-001",
      undefined,
    ]);
    await expect(readSubmissionHistory()).resolves.toHaveLength(1);
  });

  it("cancela entre um envio e outro, sem interromper o envio em andamento", async () => {
    const controller = new AbortController();
    const { commands } = mockQueuePage();
    const { onSubmitted, result } = runQueue({
      interval: 60000,
      signal: controller.signal,
    });
    onSubmitted.mockImplementation(() => controller.abort());
    const queue = await result;
    expect(queue.outcome).toBe("cancelled");
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "pending",
      "pending",
    ]);
    expect(commands.filter(({ type }) => type === "submit-form")).toHaveLength(
      1,
    );
  });

  it("não envia nada quando é cancelada antes de começar", async () => {
    const controller = new AbortController();
    controller.abort();
    const { commands } = mockQueuePage();
    const queue = await runQueue({ signal: controller.signal }).result;
    expect(queue.outcome).toBe("cancelled");
    expect(listPendingUnits(queue)).toHaveLength(3);
    expect(commands).toHaveLength(0);
  });

  it("não envia quando o formulário não tem seletor de unidade", async () => {
    const { commands } = mockQueuePage();
    const queue = await runQueue({ form: { ...form, selects: [] } }).result;
    expect(queue.outcome).toBe("stopped");
    expect(listPendingUnits(queue)).toHaveLength(3);
    expect(commands).toHaveLength(0);
  });
});
