import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { PageForms } from "@/components/extension-popup/page-forms";
import { readSubmissionHistory } from "@/lib/submission-history";

const forms = [
  {
    definitionId: "autodromo-offer",
    definitionName: "Formulário de oferta",
    index: 0,
    label: "oferta - GEELY EX5 PRO - Enviar",
  },
  {
    definitionId: "autodromo-section",
    definitionName: "Formulário de seção",
    index: 2,
    label: "",
  },
];
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

function isSubmission(command: unknown): boolean {
  return (
    typeof command === "object" &&
    command !== null &&
    "type" in command &&
    command.type === "submit-form"
  );
}

function mockPage(respond: (command: unknown) => unknown) {
  let command: unknown;
  vi.spyOn(tabs, "query").mockResolvedValue([
    { id: 7, url: "https://example.com/" },
  ]);

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
        ? { ok: true, result: { name: "Teste" } }
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
    expect(
      await screen.findByText(/^Envio LT-\d{8}-\d{6}-001 disparado\./),
    ).toBeVisible();
    await user.click(submit);
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
        : { ok: true, result: {} };
    });
    const user = userEvent.setup();
    render(<PageForms onSubmitted={vi.fn()} />);
    const items = await screen.findAllByRole("listitem");
    const submit = within(items[0]!).getByRole("button", {
      name: "Enviar teste",
    });
    await user.click(submit);
    expect(
      await screen.findByText(
        'Campo "cpf" da definição não encontrado no formulário.',
      ),
    ).toBeVisible();
    await expect(readSubmissionHistory()).resolves.toEqual([]);
    await user.click(submit);
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
    finish({ ok: true, result: {} });
    expect(await screen.findByText(/^Envio LT-.+ disparado\./)).toBeVisible();
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
