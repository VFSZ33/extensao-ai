import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { RecognizedForm } from "@/lib/page-command";
import type { PageForms } from "@/lib/page-forms";

import { readSubmissionHistory } from "@/lib/submission-history";
import {
  listPendingUnits,
  runSubmissionQueue,
  type SubmissionQueue,
  type SubmissionQueueOptions,
} from "@/lib/submission-queue";

type Command = { selections?: Record<string, string>; type: string };

const form: RecognizedForm = {
  definitionId: "autodromo-section",
  definitionName: "Formulário de seção",
  index: 4,
  label: "CRETA 1.0 TGDI FLEX COMFORT - Enviar",
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
const tabs: { get: (tabId: number) => Promise<object> } = browser.tabs;
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
  detect?: (submitted: number) => unknown;
  submit?: (command: Command, submitted: number) => unknown;
} = {}) {
  const commands: Command[] = [];
  let command: Command | undefined;
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

      if (command.type === "detect-forms") {
        const forms = detect(submitted);

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
      ["submit-form", { bestTime: "morning", unit: "north" }],
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
    expect(commands).toHaveLength(4);
    finishes[1]?.(undefined);
    await expect(result).resolves.toMatchObject({ outcome: "completed" });
  });

  it("para e mantém as unidades pendentes quando o endereço da aba muda depois de um envio", async () => {
    const { commands } = mockQueuePage();
    vi.spyOn(tabs, "get")
      .mockResolvedValueOnce({ active: true, id: 7, url: page.pageUrl })
      .mockResolvedValue({
        active: true,
        id: 7,
        url: page.pageUrl + "/obrigado",
      });
    const { onSubmitted, result } = runQueue();
    const queue = await result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.message).toBe(
      "A página mudou depois do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
    );
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

  it("para quando a página é recarregada e o documento do envio não existe mais", async () => {
    mockQueuePage({
      detect: (submitted) => {
        if (submitted > 0) {
          throw new Error("No document with id document.");
        }

        return [form];
      },
    });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "pending",
      "pending",
    ]);
  });

  it("para quando o formulário some depois do envio", async () => {
    mockQueuePage({ detect: (submitted) => (submitted === 0 ? [form] : []) });
    const queue = await runQueue().result;
    expect(queue.outcome).toBe("stopped");
    expect(queue.items.map(({ status }) => status)).toEqual([
      "sent",
      "pending",
      "pending",
    ]);
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
