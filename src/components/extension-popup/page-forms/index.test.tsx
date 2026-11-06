import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { SubmissionRecord } from "@/lib/submission-history";
import type { SubmissionQueueOptions } from "@/lib/submission-queue";

import { PageForms } from "@/components/extension-popup/page-forms";
import { isRecord } from "@/lib/is-record";
import { readSubmissionHistory } from "@/lib/submission-history";

const forms = [
  {
    definitionId: "autodromo-offer",
    definitionName: "Formulário de oferta",
    index: 0,
    label: "oferta - GEELY EX5 PRO - Enviar",
    selects: [],
  },
  {
    definitionId: "autodromo-section",
    definitionName: "Formulário de seção",
    index: 2,
    label: "",
    selects: [],
  },
];
const formsWithSelect = [
  forms[0],
  {
    ...forms[1],
    selects: [
      {
        key: "unit",
        label: "Unidade",
        options: [
          { label: "Unidade Norte", value: "north" },
          { label: "Unidade Sul", value: "south" },
        ],
      },
    ],
  },
];
const tabs: {
  get: (tabId: number) => Promise<object>;
  query: (query: object) => Promise<object[]>;
} = browser.tabs;
const units = [
  { label: "Unidade Leste", value: "east" },
  { label: "Unidade Norte", value: "north" },
  { label: "Unidade Sul", value: "south" },
];
const formsWithUnit = [
  forms[0],
  {
    ...forms[1],
    label: "CRETA 1.0 TGDI FLEX COMFORT - Enviar",
    selects: [
      {
        key: "bestTime",
        label: "Melhor horário",
        options: [{ label: "Manhã", value: "morning" }],
      },
      { key: "unit", label: "Unidade", options: units, unit: true },
    ],
  },
];

vi.mock("@/lib/submission-queue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/submission-queue")>();

  return {
    ...actual,
    runSubmissionQueue: (options: SubmissionQueueOptions) =>
      actual.runSubmissionQueue({ ...options, interval: 0 }),
  };
});

async function confirmSubmission(user: UserEvent) {
  await user.click(
    await screen.findByRole("button", { name: "Confirmar envio" }),
  );
}

function isSubmission(command: unknown): boolean {
  return (
    typeof command === "object" &&
    command !== null &&
    "type" in command &&
    command.type === "submit-form"
  );
}

function mockPage(
  respond: (command: unknown) => unknown,
  url = "https://example.com/",
) {
  let command: unknown;
  vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7, url }]);

  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async (injection) => {
      if ("args" in injection) {
        command = injection.args?.[1];
      }

      return [
        {
          documentId: "document",
          frameId: 0,
          result: "files" in injection ? await respond(command) : undefined,
        },
      ];
    });
}

describe("Formulários da página", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("lista os formulários reconhecidos com o que os distingue", async () => {
    mockPage(() => ({ ok: true, result: forms }));
    render(<PageForms onSubmitted={vi.fn()} />);
    const region = screen.getByRole("region", {
      name: "Formulários da página",
    });
    const items = await within(region).findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      within(items[0]!).getByRole("button", { name: "Enviar teste" }),
    ).toHaveAccessibleDescription(
      "Formulário de oferta oferta - GEELY EX5 PRO - Enviar",
    );
    expect(
      within(items[1]!).getByRole("button", { name: "Enviar teste" }),
    ).toHaveAccessibleDescription("Formulário de seção Sem rótulo na página");
  });

  it("envia o formulário escolhido, com dados novos a cada clique", async () => {
    const executeScript = mockPage((command) =>
      isSubmission(command)
        ? {
            ok: true,
            result: { unfilledFields: [], values: { name: "Teste" } },
          }
        : { ok: true, result: forms },
    );
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<PageForms onSubmitted={onSubmitted} />);
    const items = await screen.findAllByRole("listitem");
    const submit = within(items[1]!).getByRole("button", {
      name: "Enviar teste",
    });
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-001 disparado\./),
    ).toBeVisible();
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-002 disparado\./),
    ).toBeVisible();
    expect(onSubmitted).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "leadIntegrationTesterPageCommand",
          expect.objectContaining({
            definitionId: "autodromo-section",
            index: 2,
            type: "submit-form",
          }),
        ],
      }),
    );
    await expect(readSubmissionHistory()).resolves.toHaveLength(2);
  });

  it("envia a opção escolhida no seletor do formulário, ou nenhuma", async () => {
    const commands: unknown[] = [];
    mockPage((command) => {
      if (!isSubmission(command)) {
        return { ok: true, result: formsWithSelect };
      }

      commands.push(command);

      return { ok: true, result: { unfilledFields: [], values: {} } };
    });
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]!).queryByRole("combobox")).not.toBeInTheDocument();
    const select = await within(items[1]!).findByRole("combobox", {
      name: "Unidade",
    });
    const submit = within(items[1]!).getByRole("button", {
      name: "Enviar teste",
    });
    expect(select).toHaveTextContent("Nenhuma");
    expect(select).toHaveAccessibleDescription(
      "Formulário de seção Sem rótulo na página",
    );
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-001 disparado\./),
    ).toBeVisible();
    await user.click(select);
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Nenhuma", "Unidade Norte", "Unidade Sul"]);
    await user.click(screen.getByRole("option", { name: "Unidade Sul" }));
    expect(select).toHaveTextContent("Unidade Sul");
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-002 disparado\./),
    ).toBeVisible();
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Nenhuma" }));
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-003 disparado\./),
    ).toBeVisible();
    expect(commands).toEqual([
      expect.objectContaining({ index: 2, selections: {} }),
      expect.objectContaining({ index: 2, selections: { unit: "south" } }),
      expect.objectContaining({ index: 2, selections: {} }),
    ]);
  });

  it("avisa quais campos do formulário ficaram sem preenchimento", async () => {
    let unfilledFields = ["bestTime", "city"];
    mockPage((command) =>
      isSubmission(command)
        ? { ok: true, result: { unfilledFields, values: {} } }
        : { ok: true, result: forms },
    );
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const submit = within(
      (await screen.findAllByRole("listitem"))[0]!,
    ).getByRole("button", { name: "Enviar teste" });
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(
        "Campos do formulário que a extensão não preencheu: bestTime, city.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/^Envio LT-.+ disparado\./)).toBeVisible();
    unfilledFields = ["city"];
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(
        "Campo do formulário que a extensão não preencheu: city.",
      ),
    ).toBeVisible();
    unfilledFields = [];
    await user.click(submit);
    await confirmSubmission(user);
    await waitFor(() =>
      expect(
        screen.queryByText(/que a extensão não preencheu/),
      ).not.toBeInTheDocument(),
    );
  });

  it("mostra o erro do envio e permite tentar de novo", async () => {
    let attempts = 0;
    mockPage((command) => {
      if (!isSubmission(command)) {
        return { ok: true, result: forms };
      }

      attempts += 1;

      return attempts === 1
        ? {
            error: 'Campo "cpf" da definição não encontrado no formulário.',
            ok: false,
          }
        : { ok: true, result: { unfilledFields: [], values: {} } };
    });
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    const submit = within(items[0]!).getByRole("button", {
      name: "Enviar teste",
    });
    await user.click(submit);
    await confirmSubmission(user);
    expect(
      await screen.findByText(
        'Campo "cpf" da definição não encontrado no formulário.',
      ),
    ).toBeVisible();
    await expect(readSubmissionHistory()).resolves.toEqual([]);
    await user.click(submit);
    await confirmSubmission(user);
    expect(await screen.findByText(/^Envio LT-.+ disparado\./)).toBeVisible();
    expect(
      screen.queryByText(
        'Campo "cpf" da definição não encontrado no formulário.',
      ),
    ).not.toBeInTheDocument();
  });

  it("impede outros envios enquanto um está em andamento", async () => {
    let finish: (response: unknown) => void = () => {};
    const executeScript = mockPage((command) =>
      isSubmission(command)
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { ok: true, result: forms },
    );
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    await user.click(
      within(items[0]!).getByRole("button", { name: "Enviar teste" }),
    );
    await confirmSubmission(user);
    const sending = await within(items[0]!).findByRole("button", {
      name: "Enviando…",
    });
    expect(sending).toHaveAttribute("aria-busy", "true");
    expect(sending).toHaveFocus();
    expect(
      within(items[1]!).getByRole("button", { name: "Enviar teste" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Atualizar lista" }),
    ).toBeDisabled();
    const calls = executeScript.mock.calls.length;
    await user.click(sending);
    expect(executeScript).toHaveBeenCalledTimes(calls);
    finish({ ok: true, result: { unfilledFields: [], values: {} } });
    expect(await screen.findByText(/^Envio LT-.+ disparado\./)).toBeVisible();
  });

  it("pede confirmação com o site e o formulário antes de enviar num site de cliente", async () => {
    const executeScript = mockPage((command) =>
      isSubmission(command)
        ? { ok: true, result: { unfilledFields: [], values: {} } }
        : { ok: true, result: forms },
    );
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    const submit = within(items[0]!).getByRole("button", {
      name: "Enviar teste",
    });
    expect(submit).toHaveAttribute("aria-expanded", "false");
    await user.click(submit);
    const confirmation = within(items[0]!).getByRole("group", {
      name: "Enviar um formulário real?",
    });
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAccessibleDescription(
      "Formulário de oferta (oferta - GEELY EX5 PRO - Enviar) será preenchido e enviado de verdade em example.com. Site de cliente (produção): o envio cria um lead real, que a concessionária recebe como contato de verdade.",
    );
    expect(submit).toHaveAttribute("aria-expanded", "true");
    expect(
      executeScript.mock.calls.some(
        ([injection]) =>
          "args" in injection && isSubmission(injection.args?.[1]),
      ),
    ).toBe(false);
    await expect(readSubmissionHistory()).resolves.toEqual([]);
    await user.click(
      within(confirmation).getByRole("button", { name: "Confirmar envio" }),
    );
    expect(await screen.findByText(/^Envio LT-.+ disparado./)).toBeVisible();
    expect(confirmation).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
    await expect(readSubmissionHistory()).resolves.toHaveLength(1);
  });

  it("identifica o site de testes na confirmação", async () => {
    mockPage(
      () => ({ ok: true, result: forms }),
      "https://loja.preview-v2.autodromo.com.br/ofertas",
    );
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    await user.click(
      within(items[1]!).getByRole("button", { name: "Enviar teste" }),
    );
    expect(
      within(items[1]!).getByRole("group", {
        name: "Enviar um formulário real?",
      }),
    ).toHaveAccessibleDescription(
      "Formulário de seção (sem rótulo na página) será preenchido e enviado de verdade em loja.preview-v2.autodromo.com.br. Site de testes (homologação): o lead vai para o painel do ambiente de testes.",
    );
    expect(screen.queryByText(/Site de cliente/)).not.toBeInTheDocument();
  });

  it("cancela a confirmação pelo botão ou pelo Esc, sem enviar, e devolve o foco", async () => {
    const executeScript = mockPage(() => ({ ok: true, result: forms }));
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    const submit = within(items[0]!).getByRole("button", {
      name: "Enviar teste",
    });
    const calls = executeScript.mock.calls.length;
    await user.click(submit);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
    await user.click(submit);
    await user.keyboard("{Tab}");
    expect(
      screen.getByRole("button", { name: "Confirmar envio" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
    expect(executeScript).toHaveBeenCalledTimes(calls);
    await expect(readSubmissionHistory()).resolves.toEqual([]);
  });

  it("mantém só um formulário em confirmação por vez", async () => {
    mockPage(() => ({ ok: true, result: forms }));
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    await user.click(
      within(items[0]!).getByRole("button", { name: "Enviar teste" }),
    );
    await user.click(
      within(items[1]!).getByRole("button", { name: "Enviar teste" }),
    );
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(within(items[1]!).getByRole("group")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Atualizar lista" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("informa quando a página não tem formulário reconhecido e atualiza a lista", async () => {
    let available: unknown[] = [];
    mockPage(() => ({ ok: true, result: available }));
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    expect(
      await screen.findByText("Nenhum formulário reconhecido nesta página."),
    ).toBeVisible();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    available = forms;
    await user.click(screen.getByRole("button", { name: "Atualizar lista" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.queryByText("Nenhum formulário reconhecido nesta página."),
    ).not.toBeInTheDocument();
  });

  it("informa quando a página não pode ser acessada", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7 }]);
    vi.spyOn(browser.scripting, "executeScript").mockRejectedValue(
      new Error("Cannot access a chrome:// URL"),
    );
    render(<PageForms onSubmitted={vi.fn()} />);
    expect(
      await screen.findByText(
        "Não foi possível acessar esta página. Abra uma página web comum e clique no ícone da extensão para tentar de novo.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});

describe("Envio para várias unidades", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  function mockUnitPage(
    submit: (unit: string, submitted: number) => unknown = (unit) =>
      respondWithUnit(unit),
  ) {
    const sent: unknown[] = [];
    const tabsGet = vi.spyOn(tabs, "get").mockResolvedValue({
      active: true,
      id: 7,
      url: "https://example.com/",
    });
    const executeScript = mockPage((command) => {
      if (!isSubmission(command)) {
        return { ok: true, result: formsWithUnit };
      }

      sent.push(command);
      const selections = isRecord(command) ? command.selections : undefined;
      const unit = isRecord(selections) ? selections.unit : undefined;

      return submit(typeof unit === "string" ? unit : "", sent.length);
    });

    return { executeScript, sent, tabsGet };
  }

  function respondWithUnit(value: string, unfilledFields: string[] = []) {
    return {
      ok: true,
      result: {
        unfilledFields,
        values: {
          unit: units.find((unit) => unit.value === value) ?? {
            label: "Selecione a unidade",
            value: "",
          },
        },
      },
    };
  }

  async function startQueue(user: UserEvent) {
    const item = (await screen.findAllByRole("listitem"))[1]!;
    await user.click(
      within(item).getByRole("switch", { name: "Enviar para várias unidades" }),
    );
    await user.click(within(item).getByRole("checkbox", { name: "Todas" }));
    await user.click(
      within(item).getByRole("button", { name: "Enviar para 3 unidades" }),
    );

    return item;
  }

  it("oferece várias unidades só no seletor marcado como unidade e volta ao envio individual", async () => {
    mockPage((command) =>
      isSubmission(command)
        ? { ok: true, result: { unfilledFields: [], values: {} } }
        : { ok: true, result: [...formsWithSelect, formsWithUnit[1]] },
    );
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    expect(within(items[1]!).queryByRole("switch")).not.toBeInTheDocument();
    const item = items[2]!;
    await user.click(
      within(item).getByRole("switch", { name: "Enviar para várias unidades" }),
    );
    expect(
      within(item).queryByRole("combobox", { name: "Unidade" }),
    ).not.toBeInTheDocument();
    expect(
      within(item).getByRole("combobox", { name: "Melhor horário" }),
    ).toBeVisible();
    const picker = within(item).getByRole("group", { name: "Unidade" });
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(4);
    expect(
      within(item).getByRole("button", { name: "Enviar para 0 unidades" }),
    ).toBeDisabled();
    await user.click(
      within(picker).getByRole("checkbox", { name: "Unidade Norte" }),
    );
    expect(
      within(item).getByRole("button", { name: "Enviar para 1 unidade" }),
    ).toBeEnabled();
    expect(
      within(picker).getByRole("checkbox", { name: "Todas" }),
    ).toHaveAttribute("aria-checked", "mixed");
    await user.click(within(picker).getByRole("checkbox", { name: "Todas" }));
    expect(
      within(item).getByRole("button", { name: "Enviar para 3 unidades" }),
    ).toBeEnabled();
    await user.click(
      within(item).getByRole("switch", { name: "Enviar para várias unidades" }),
    );
    expect(
      within(item).getByRole("combobox", { name: "Unidade" }),
    ).toHaveTextContent("Nenhuma");
    expect(
      within(item).getByRole("button", { name: "Enviar teste" }),
    ).toBeEnabled();
  });

  it("confirma uma vez e envia uma unidade por vez, cada uma com identificador e registro próprios", async () => {
    const { sent } = mockUnitPage();
    const onSubmitted = vi.fn<(record?: SubmissionRecord) => void>();
    const user = userEvent.setup();
    render(<PageForms onSubmitted={onSubmitted} />);
    const item = (await screen.findAllByRole("listitem"))[1]!;
    await user.click(
      within(item).getByRole("combobox", { name: "Melhor horário" }),
    );
    await user.click(await screen.findByRole("option", { name: "Manhã" }));
    await startQueue(user);
    const confirmation = within(item).getByRole("group", {
      name: "Enviar 3 formulários reais?",
    });
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAccessibleDescription(
      "Formulário de seção (CRETA 1.0 TGDI FLEX COMFORT - Enviar) será preenchido e enviado de verdade em example.com, uma vez para cada unidade, um envio de cada vez: Unidade Leste, Unidade Norte, Unidade Sul. A fila para se a página mudar ou um envio falhar, e pode ser cancelada entre um envio e outro. Site de cliente (produção): o envio cria um lead real, que a concessionária recebe como contato de verdade.",
    );
    expect(sent).toHaveLength(0);
    await user.click(
      within(confirmation).getByRole("button", { name: "Confirmar 3 envios" }),
    );
    const queue = screen.getByRole("group", { name: "Fila de envios" });
    expect(
      await within(queue).findByText(
        "Fila concluída: 3 de 3 envios disparados. Confira os leads no painel com os dados do histórico.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("group", { name: /^Enviar/ }),
    ).not.toBeInTheDocument();
    expect(sent).toEqual(
      ["east", "north", "south"].map((unit) =>
        expect.objectContaining({
          index: 2,
          selections: { bestTime: "morning", unit },
        }),
      ),
    );
    const ids = onSubmitted.mock.calls.map(([record]) => record?.id);
    expect(ids).toEqual([
      expect.stringMatching(/^LT-\d{8}-\d{6}-001$/),
      expect.stringMatching(/^LT-\d{8}-\d{6}-002$/),
      expect.stringMatching(/^LT-\d{8}-\d{6}-003$/),
    ]);
    expect(
      within(within(queue).getByRole("list", { name: "Unidades da fila" }))
        .getAllByRole("listitem")
        .map((unit) => unit.textContent),
    ).toEqual([
      "Unidade Leste: envio " + String(ids[0]) + " disparado.",
      "Unidade Norte: envio " + String(ids[1]) + " disparado.",
      "Unidade Sul: envio " + String(ids[2]) + " disparado.",
    ]);
    const history = await readSubmissionHistory();
    expect(history.map(({ id, unit }) => [id, unit?.label])).toEqual([
      [ids[2], "Unidade Sul"],
      [ids[1], "Unidade Norte"],
      [ids[0], "Unidade Leste"],
    ]);
    expect(
      within(queue).queryByRole("button", { name: "Cancelar fila" }),
    ).not.toBeInTheDocument();
    expect(
      within(item).getByRole("button", { name: "Enviar para 3 unidades" }),
    ).toBeEnabled();
  });

  it("mostra o progresso, bloqueia outros envios e cancela a fila depois do envio em andamento", async () => {
    const finishes: (() => void)[] = [];
    const { executeScript, sent } = mockUnitPage(
      (unit) =>
        new Promise((resolve) => {
          finishes.push(() => resolve(respondWithUnit(unit)));
        }),
    );
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<PageForms onSubmitted={onSubmitted} />);
    const item = await startQueue(user);
    await user.click(
      screen.getByRole("button", { name: "Confirmar 3 envios" }),
    );
    const sending = await within(item).findByRole("button", {
      name: "Enviando 1 de 3…",
    });
    const queue = screen.getByRole("group", { name: "Fila de envios" });
    expect(
      await within(queue).findByText("Enviando 1 de 3: Unidade Leste…"),
    ).toBeVisible();
    expect(sending).toHaveFocus();
    expect(
      within(item).getByRole("switch", { name: "Enviar para várias unidades" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(screen.getAllByRole("listitem")[0]!).getByRole("button", {
        name: "Enviar teste",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Atualizar lista" }),
    ).toBeDisabled();
    const calls = executeScript.mock.calls.length;
    await user.click(sending);
    expect(executeScript).toHaveBeenCalledTimes(calls);
    expect(
      screen.queryByRole("group", { name: /^Enviar/ }),
    ).not.toBeInTheDocument();
    await user.click(
      within(queue).getByRole("button", { name: "Cancelar fila" }),
    );
    expect(
      within(queue).getByText(
        "Cancelando: a fila para depois do envio em andamento.",
      ),
    ).toBeVisible();
    finishes[0]?.();
    expect(
      await within(queue).findByText(
        "Fila cancelada: 1 de 3 envios disparados.",
      ),
    ).toBeVisible();
    expect(
      within(queue).getByText(
        "Unidades pendentes, sem envio: Unidade Norte, Unidade Sul.",
      ),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    await expect(readSubmissionHistory()).resolves.toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Atualizar lista" }),
    ).toBeEnabled();
  });

  it("para quando a página muda depois de um envio, mostra as pendentes e as marca ao atualizar a lista", async () => {
    const { sent, tabsGet } = mockUnitPage();
    tabsGet
      .mockResolvedValueOnce({
        active: true,
        id: 7,
        url: "https://example.com/",
      })
      .mockResolvedValue({
        active: true,
        id: 7,
        url: "https://example.com/obrigado",
      });
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    await startQueue(user);
    await user.click(
      screen.getByRole("button", { name: "Confirmar 3 envios" }),
    );
    const queue = screen.getByRole("group", { name: "Fila de envios" });
    expect(
      await within(queue).findByText(
        "Fila interrompida: 1 de 3 envios disparados.",
      ),
    ).toBeVisible();
    expect(
      within(queue).getByText(
        "A página mudou depois do envio anterior, e a fila parou antes de Unidade Norte para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      ),
    ).toBeVisible();
    expect(
      within(queue).getByText(
        "Unidades pendentes, sem envio: Unidade Norte, Unidade Sul.",
      ),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Atualizar lista" }));
    const refreshed = (await screen.findAllByRole("listitem"))[1]!;
    expect(
      await within(refreshed).findByRole("button", {
        name: "Enviar para 2 unidades",
      }),
    ).toBeEnabled();
    expect(
      within(refreshed).getByRole("switch", {
        name: "Enviar para várias unidades",
      }),
    ).toBeChecked();
    expect(
      within(refreshed).getByRole("checkbox", { name: "Unidade Leste" }),
    ).not.toBeChecked();
    expect(
      within(refreshed).getByRole("checkbox", { name: "Unidade Norte" }),
    ).toBeChecked();
    expect(
      within(refreshed).getByRole("checkbox", { name: "Unidade Sul" }),
    ).toBeChecked();
    expect(
      screen.queryByRole("group", { name: "Fila de envios" }),
    ).not.toBeInTheDocument();
  });

  it("para quando um envio falha e mostra a falha e as pendentes, sem contar a falha como envio", async () => {
    const { sent } = mockUnitPage((unit, submitted) =>
      submitted === 2
        ? { error: "O botão de envio está desabilitado.", ok: false }
        : respondWithUnit(unit, ["city"]),
    );
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<PageForms onSubmitted={onSubmitted} />);
    await startQueue(user);
    await user.click(
      screen.getByRole("button", { name: "Confirmar 3 envios" }),
    );
    const queue = screen.getByRole("group", { name: "Fila de envios" });
    expect(
      await within(queue).findByText(
        "Fila interrompida: 1 de 3 envios disparados.",
      ),
    ).toBeVisible();
    expect(
      within(queue).getByText(
        "O envio para Unidade Norte falhou, e a fila parou para não seguir com a página num estado desconhecido.",
      ),
    ).toBeVisible();
    expect(
      within(queue).getByText(
        "Unidade Norte: falhou. O botão de envio está desabilitado.",
      ),
    ).toBeVisible();
    expect(
      within(queue).getByText("Campo não preenchido: city."),
    ).toBeVisible();
    expect(
      within(queue).getByText("Unidade pendente, sem envio: Unidade Sul."),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(onSubmitted.mock.calls.map(([record]) => record?.id)).toEqual([
      expect.stringMatching(/^LT-\d{8}-\d{6}-001$/),
      undefined,
    ]);
    await expect(readSubmissionHistory()).resolves.toHaveLength(1);
  });

  it("mantém o envio individual, com a unidade no registro, quando o envio para várias unidades está desligado", async () => {
    const { sent } = mockUnitPage();
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const item = (await screen.findAllByRole("listitem"))[1]!;
    await user.click(within(item).getByRole("combobox", { name: "Unidade" }));
    await user.click(
      await screen.findByRole("option", { name: "Unidade Sul" }),
    );
    await user.click(
      within(item).getByRole("button", { name: "Enviar teste" }),
    );
    await confirmSubmission(user);
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-001 disparado\./),
    ).toBeVisible();
    expect(sent).toEqual([
      expect.objectContaining({ selections: { unit: "south" } }),
    ]);
    expect(
      screen.queryByRole("group", { name: "Fila de envios" }),
    ).not.toBeInTheDocument();
    const [record] = await readSubmissionHistory();
    expect(record?.unit).toEqual({ label: "Unidade Sul", value: "south" });
  });
});
