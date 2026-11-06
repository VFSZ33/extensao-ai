import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PANEL_ACCOUNT_ID,
  PANEL_LEADS_URL,
  PANEL_TEST_SUBMISSION_ID,
  panelReport,
} from "@tests/fixtures/panel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { SubmissionHistoryProps } from "@/components/extension-popup/submission-history";
import type {
  LeadIntegrationReport,
  VerifiedLead,
} from "@/lib/integration-status";

import { LeadIntegrations } from "@/components/extension-popup/lead-integrations";

type Injection = { args?: unknown[]; files?: string[] };

const emptyHistory: SubmissionHistoryProps["history"] = {
  records: [],
  status: "ready",
};
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

function findParagraph(text: string): Promise<HTMLElement> {
  return screen.findByText(
    (_content, element) =>
      element?.tagName === "P" && element.textContent === text,
  );
}

function getCards(): HTMLElement[] {
  const list = screen.getByRole("list", { name: "Leads verificados" });

  return within(list)
    .getAllByRole("listitem")
    .filter((item) => item.parentElement === list);
}

function listTexts(list: HTMLElement): (null | string)[] {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

function mockPanel(respond: () => unknown) {
  vi.spyOn(tabs, "query").mockResolvedValue([{ id: 7, url: PANEL_LEADS_URL }]);

  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async (injection) => [
      {
        documentId: "document",
        frameId: 0,
        result: "files" in injection ? await respond() : undefined,
      },
    ]);
}

function readInjections(executeScript: {
  mock: { calls: unknown[][] };
}): Injection[] {
  return executeScript.mock.calls.map(([injection]) => injection as Injection);
}

function readQueries(executeScript: { mock: { calls: unknown[][] } }) {
  return readInjections(executeScript).flatMap(({ args }) =>
    args ? [args[1]] : [],
  );
}

function readVerifications(executeScript: { mock: { calls: unknown[][] } }) {
  return readInjections(executeScript).filter(({ files }) => files).length;
}

async function verify() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Verificar integrações" }),
  );

  return user;
}

describe("Integrações dos leads", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("não acessa o painel antes do clique", () => {
    const executeScript = mockPanel(() => ({ ok: true, result: panelReport }));
    render(<LeadIntegrations history={emptyHistory} />);
    expect(
      screen.getByRole("region", { name: "Integrações dos leads" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verificar integrações" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "Quantidade" }),
    ).toHaveTextContent("10");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copiar relatório" }),
    ).not.toBeInTheDocument();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("mostra o resumo por status e cada integração de cada lead", async () => {
    mockPanel(() => ({ ok: true, result: panelReport }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(await screen.findByText("6 leads verificados.")).toBeVisible();
    expect(
      listTexts(screen.getByRole("list", { name: "Resumo por status" })),
    ).toEqual([
      "OK: 1",
      "Erro: 1",
      "Não confirmado: 1",
      "Pendente: 1",
      "Sem evento: 1",
      "Não consultado: 1",
    ]);
    const cards = getCards();
    expect(cards).toHaveLength(6);
    expect(cards[0]).toHaveTextContent("Teste LT-20261008-141748-012");
    expect(cards[0]).toHaveTextContent(
      "lt-20261008-141748-012@example.com · 11900000001",
    );
    expect(
      listTexts(within(cards[0]!).getByRole("list", { name: "Integrações" })),
    ).toEqual([
      "My Honda — OK",
      "RD Station — Erro: Parâmetros incompletos [ 3f9a1c ]",
    ]);
    expect(
      listTexts(within(cards[1]!).getByRole("list", { name: "Integrações" })),
    ).toEqual(["Syonet — OK"]);
    expect(
      listTexts(within(cards[2]!).getByRole("list", { name: "Integrações" })),
    ).toEqual(["RD Station — Pendente"]);
    expect(cards[3]).toHaveTextContent("Dora Modelo");
    expect(cards[3]).toHaveTextContent("Sem evento");
    expect(cards[3]).toHaveTextContent(
      "Nenhum evento de integração para este lead.",
    );
    expect(within(cards[3]!).queryByRole("list")).not.toBeInTheDocument();
    expect(
      listTexts(within(cards[4]!).getByRole("list", { name: "Integrações" })),
    ).toEqual([
      "My Honda — OK",
      "RD Station — Não confirmado: há tentativas posteriores que podem ser de outro lead do mesmo contato",
    ]);
    expect(cards[5]).toHaveTextContent("Não consultado");
    expect(cards[5]).toHaveTextContent(
      "Não foi possível consultar as integrações deste lead.",
    );
    expect(cards[5]).toHaveTextContent(
      "A API do painel respondeu com erro (HTTP 500).",
    );
  });

  it("mostra a integração não confirmada com o motivo e a conta no resumo", async () => {
    mockPanel(() => ({
      ok: true,
      result: {
        leads: [
          {
            ...panelReport.leads[4],
            integrations: [
              { message: "", name: "My Honda", reason: "", status: "ok" },
              {
                message: "",
                name: "RD Station",
                reason:
                  "há tentativas posteriores que podem ser de outro lead do mesmo contato",
                status: "not-confirmed",
              },
            ],
            status: "not-confirmed",
          },
        ],
        missingLeads: 0,
      },
    }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(await screen.findByText("1 lead verificado.")).toBeVisible();
    expect(
      listTexts(screen.getByRole("list", { name: "Resumo por status" })),
    ).toEqual([
      "OK: 0",
      "Erro: 0",
      "Não confirmado: 1",
      "Pendente: 0",
      "Sem evento: 0",
    ]);
    const [card] = getCards();
    expect(card).toHaveTextContent("Não confirmado");
    expect(
      listTexts(within(card!).getByRole("list", { name: "Integrações" })),
    ).toEqual([
      "My Honda — OK",
      "RD Station — Não confirmado: há tentativas posteriores que podem ser de outro lead do mesmo contato",
    ]);
  });

  it("mostra o horário local de criação de cada lead e a hora da consulta concluída", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 15, 30, 12));
    const createdAt = new Date(2026, 9, 8, 14, 17, 48).toISOString();
    mockPanel(() => ({
      ok: true,
      result: {
        leads: [{ ...panelReport.leads[1], createdAt }],
        missingLeads: 0,
      },
    }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(await screen.findByText("1 lead verificado.")).toBeVisible();
    expect(screen.getByText("08/10/2026, 14:17:48")).toHaveAttribute(
      "dateTime",
      createdAt,
    );
    expect(
      await findParagraph("Consulta concluída em 19/10/2026, 15:30:12."),
    ).toHaveClass("text-text-secondary");
    expect(
      listTexts(screen.getByRole("list", { name: "Resumo por status" })),
    ).toEqual(["OK: 1", "Erro: 0", "Pendente: 0", "Sem evento: 0"]);
  });

  it("avisa a consulta incompleta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 15, 30, 12));
    mockPanel(() => ({
      ok: true,
      result: { ...panelReport, missingLeads: 2 },
    }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(
      await findParagraph(
        "Consulta incompleta em 19/10/2026, 15:30:12: 1 lead ficou sem consulta ao histórico de integrações; a API deixou de devolver 2 leads que informou existir. Verifique de novo para completar.",
      ),
    ).toHaveClass("text-feedback-warning");
  });

  it("envia a quantidade e a busca escolhidas e indica que o resultado é de uma busca", async () => {
    const executeScript = mockPanel(() => ({
      ok: true,
      result: { leads: [panelReport.leads[0]], missingLeads: 0 },
    }));
    const user = userEvent.setup();
    render(<LeadIntegrations history={emptyHistory} />);
    await user.click(screen.getByRole("combobox", { name: "Quantidade" }));
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["5", "10", "20"]);
    await user.click(screen.getByRole("option", { name: "20" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
      "  " + PANEL_TEST_SUBMISSION_ID + " ",
    );
    await user.click(
      screen.getByRole("button", { name: "Verificar integrações" }),
    );
    expect(
      await screen.findByText(
        "Resultado da busca por “" +
          PANEL_TEST_SUBMISSION_ID +
          "” na API, até 20 leads.",
      ),
    ).toBeVisible();
    expect(screen.getByText("1 lead verificado.")).toBeVisible();
    expect(readQueries(executeScript)).toEqual([
      { limit: 20, search: PANEL_TEST_SUBMISSION_ID },
    ]);
  });

  it("verifica com Enter na busca e informa a busca sem resultado", async () => {
    const executeScript = mockPanel(() => ({
      ok: true,
      result: { leads: [], missingLeads: 0 },
    }));
    const user = userEvent.setup();
    render(<LeadIntegrations history={emptyHistory} />);
    await user.type(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
      "ninguém{Enter}",
    );
    expect(
      await screen.findByText("Nenhum lead encontrado nesta busca."),
    ).toBeVisible();
    expect(readQueries(executeScript)).toEqual([
      { limit: 10, search: "ninguém" },
    ]);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("destaca o lead de teste e diz se ele consta no histórico de envios", async () => {
    mockPanel(() => ({
      ok: true,
      result: {
        leads: [
          panelReport.leads[0],
          {
            ...panelReport.leads[1],
            email: "lt-20261009-090000-013@example.com",
          },
          panelReport.leads[2],
        ],
        missingLeads: 0,
      },
    }));
    const { rerender } = render(
      <LeadIntegrations
        history={{
          records: [
            {
              definitionId: "autodromo-offer",
              definitionName: "Formulário de oferta",
              formLabel: "oferta - GEELY EX5 PRO - Enviar",
              id: PANEL_TEST_SUBMISSION_ID,
              pageUrl: "https://example.com/",
              submittedAt: "2026-10-08T17:17:48.000Z",
              values: {},
            },
          ],
          status: "ready",
        }}
      />,
    );
    await verify();
    await screen.findByText("3 leads verificados.");
    let cards = getCards();
    expect(cards[0]).toHaveTextContent(
      "Lead de teste LT-20261008-141748-012 · consta no histórico de envios",
    );
    expect(cards[1]).toHaveTextContent(
      "Lead de teste LT-20261009-090000-013 · não consta no histórico de envios desta extensão",
    );
    expect(cards[2]).not.toHaveTextContent("Lead de teste");
    rerender(<LeadIntegrations history={{ status: "error" }} />);
    cards = getCards();
    expect(cards[0]).toHaveTextContent("Lead de teste LT-20261008-141748-012");
    expect(cards[0]).not.toHaveTextContent("histórico de envios");
  });

  it("mostra como texto o que a API devolveu e avisa o erro sem motivo", async () => {
    mockPanel(() => ({
      ok: true,
      result: {
        leads: [
          {
            ...panelReport.leads[0],
            integrations: [
              { message: "", name: "My Honda", reason: "", status: "error" },
              {
                message: "<img alt='x' src='x'>",
                name: "<b>RD</b>",
                reason: "",
                status: "error",
              },
            ],
            name: "",
          },
        ],
        missingLeads: 0,
      },
    }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    await screen.findByText("1 lead verificado.");
    const [card] = getCards();
    expect(card).toHaveTextContent("Lead sem nome");
    expect(
      listTexts(within(card!).getByRole("list", { name: "Integrações" })),
    ).toEqual([
      "My Honda — Erro: motivo não informado pela API",
      "<b>RD</b> — Erro: <img alt='x' src='x'>",
    ]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("informa quando a conta não tem leads", async () => {
    mockPanel(() => ({ ok: true, result: { leads: [], missingLeads: 0 } }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(await screen.findByText("Esta conta não tem leads.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("mostra o erro da verificação, com a hora, e permite tentar de novo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 15, 30, 12));
    let attempts = 0;
    mockPanel(() => {
      attempts += 1;

      return attempts === 1
        ? {
            error:
              "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
            ok: false,
          }
        : { ok: true, result: panelReport };
    });
    render(<LeadIntegrations history={emptyHistory} />);
    const user = await verify();
    expect(
      await screen.findByText(
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      ),
    ).toBeVisible();
    expect(
      await findParagraph("Consulta falhou em 19/10/2026, 15:30:12."),
    ).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copiar relatório" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Verificar integrações" }),
    );
    expect(await screen.findByText("6 leads verificados.")).toBeVisible();
    expect(
      screen.queryByText(
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      ),
    ).not.toBeInTheDocument();
  });

  it("informa quando a aba ativa deixou de ser o painel", async () => {
    const executeScript = mockPanel(() => ({ ok: true, result: panelReport }));
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: "https://example.com/" },
    ]);
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(
      await screen.findByText(
        "Abra o painel administrativo na aba ativa para verificar as integrações.",
      ),
    ).toBeVisible();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("impede outra verificação e trava a consulta enquanto uma está em andamento", async () => {
    let finish: (response: unknown) => void = () => {};
    const executeScript = mockPanel(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<LeadIntegrations history={emptyHistory} />);
    const user = await verify();
    const verifying = await screen.findByRole("button", {
      name: "Verificando integrações…",
    });
    expect(verifying).toHaveAttribute("aria-busy", "true");
    expect(verifying).toHaveFocus();
    expect(
      screen.getByRole("combobox", { name: "Quantidade" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
    ).toHaveAttribute("readonly");
    await user.click(verifying);
    expect(readVerifications(executeScript)).toBe(1);
    finish({ ok: true, result: panelReport });
    expect(await screen.findByText("6 leads verificados.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verificar integrações" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
    ).not.toHaveAttribute("readonly");
    expect(
      screen.getByRole("combobox", { name: "Quantidade" }),
    ).not.toHaveAttribute("data-disabled");
  });

  it("não repete a verificação com Enter na busca durante a consulta", async () => {
    let finish: (response: unknown) => void = () => {};
    const executeScript = mockPanel(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<LeadIntegrations history={emptyHistory} />);
    const search = screen.getByRole("searchbox", { name: "Busca (opcional)" });
    await user.type(search, "Bruna{Enter}");
    await screen.findByRole("button", { name: "Verificando integrações…" });
    await user.type(search, "{Enter}{Enter}x");
    expect(search).toHaveValue("Bruna");
    expect(search).toHaveFocus();
    expect(readVerifications(executeScript)).toBe(1);
    finish({ ok: true, result: { leads: [], missingLeads: 0 } });
    expect(
      await screen.findByText("Nenhum lead encontrado nesta busca."),
    ).toBeVisible();
    expect(readVerifications(executeScript)).toBe(1);
  });

  it("copia o relatório de diagnóstico sem dados de contato", async () => {
    mockPanel(() => ({ ok: true, result: panelReport }));
    render(<LeadIntegrations history={emptyHistory} />);
    const user = await verify();
    await screen.findByText("6 leads verificados.");
    await user.click(screen.getByRole("button", { name: "Copiar relatório" }));
    expect(
      await screen.findByText(
        "Relatório copiado para a área de transferência.",
      ),
    ).toBeVisible();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("Diagnóstico das integrações — Scanner de Leads");
    expect(copied).toContain("Escopo: os 10 leads mais recentes da conta");
    expect(copied).toContain(
      "Situação: incompleta — 1 lead ficou sem consulta ao histórico de integrações",
    );
    expect(copied).toContain(
      "Identificador: 00000000-0000-4000-8000-000000000001",
    );
    expect(copied).toContain(
      "- RD Station: Erro — Parâmetros incompletos [ 3f9a1c ]",
    );

    for (const { email, phone } of panelReport.leads) {
      expect(copied).not.toContain(email);
      expect(copied).not.toContain(phone);
    }
  });

  it("informa a falha ao copiar o relatório", async () => {
    mockPanel(() => ({ ok: true, result: panelReport }));
    render(<LeadIntegrations history={emptyHistory} />);
    const user = await verify();
    await screen.findByText("6 leads verificados.");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Document is not focused."),
    );
    await user.click(screen.getByRole("button", { name: "Copiar relatório" }));
    expect(
      await screen.findByText(
        "Não foi possível copiar o relatório. Tente de novo.",
      ),
    ).toBeVisible();
  });
});

describe("Atualização automática e foco no lead", () => {
  const caio = panelReport.leads[2] as VerifiedLead;
  const pending: LeadIntegrationReport = { leads: [caio], missingLeads: 0 };
  const done: LeadIntegrationReport = {
    leads: [
      {
        ...caio,
        integrations: [
          { message: "", name: "RD Station", reason: "", status: "ok" },
        ],
        status: "ok",
      },
    ],
    missingLeads: 0,
  };

  async function advance(milliseconds: number) {
    await act(() => vi.advanceTimersByTimeAsync(milliseconds));
  }

  function getParagraph(text: string): HTMLElement {
    return screen.getByText(
      (_content, element) =>
        element?.tagName === "P" && element.textContent === text,
    );
  }

  async function verifyWithSearch(text: string) {
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
      { target: { value: text } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Verificar integrações" }),
    );
    await advance(0);
  }

  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({
      now: new Date(2026, 9, 19, 15, 30, 0),
      toFake: ["Date", "setTimeout", "clearTimeout"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("atualiza a cada 30 s com a mesma consulta, sem perder a busca, a quantidade e o resultado", async () => {
    let result = pending;
    const executeScript = mockPanel(() => ({ ok: true, result }));
    render(<LeadIntegrations autoRefresh history={emptyHistory} />);
    await verifyWithSearch("Caio");
    expect(screen.getByText("1 lead verificado.")).toBeVisible();
    expect(getCards()[0]).toHaveTextContent("RD Station — Pendente");
    expect(
      getParagraph(
        "Atualização automática a cada 30 s; última conferência em 19/10/2026, 15:30:00.",
      ),
    ).toBeVisible();
    await advance(29000);
    expect(readVerifications(executeScript)).toBe(1);
    result = done;
    await advance(1000);
    expect(readVerifications(executeScript)).toBe(2);
    expect(getCards()[0]).toHaveTextContent("RD Station — OK");
    expect(
      getParagraph("Consulta concluída em 19/10/2026, 15:30:30."),
    ).toBeVisible();
    await advance(30000);
    expect(readVerifications(executeScript)).toBe(3);
    expect(
      getParagraph("Consulta concluída em 19/10/2026, 15:30:30."),
    ).toBeVisible();
    expect(
      getParagraph(
        "Atualização automática a cada 30 s; última conferência em 19/10/2026, 15:31:00.",
      ),
    ).toBeVisible();
    expect(readQueries(executeScript)).toEqual([
      { limit: 10, search: "Caio" },
      { limit: 10, search: "Caio" },
      { limit: 10, search: "Caio" },
    ]);
    expect(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
    ).toHaveValue("Caio");
    expect(
      screen.getByRole("combobox", { name: "Quantidade" }),
    ).toHaveTextContent("10");
  });

  it("consulta só com a opção ativa e a seção à vista, e retoma ao voltar", async () => {
    const executeScript = mockPanel(() => ({ ok: true, result: pending }));
    const { rerender } = render(<LeadIntegrations history={emptyHistory} />);
    await verifyWithSearch("Caio");
    expect(screen.getByText("1 lead verificado.")).toBeVisible();
    await advance(60000);
    expect(readVerifications(executeScript)).toBe(1);
    expect(
      screen.queryByText(/Atualização automática a cada/),
    ).not.toBeInTheDocument();
    rerender(
      <LeadIntegrations autoRefresh history={emptyHistory} visible={false} />,
    );
    await advance(60000);
    expect(readVerifications(executeScript)).toBe(1);
    rerender(<LeadIntegrations autoRefresh history={emptyHistory} />);
    await advance(0);
    expect(readVerifications(executeScript)).toBe(2);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(60000);
    expect(readVerifications(executeScript)).toBe(2);
    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);
    expect(readVerifications(executeScript)).toBe(3);
  });

  it("mantém o resultado e avisa quando a atualização falha", async () => {
    let fail = false;
    const executeScript = mockPanel(() =>
      fail
        ? {
            error: "A API do painel não respondeu a tempo. Tente de novo.",
            ok: false,
          }
        : { ok: true, result: pending },
    );
    render(<LeadIntegrations autoRefresh history={emptyHistory} />);
    await verifyWithSearch("Caio");
    expect(screen.getByText("1 lead verificado.")).toBeVisible();
    fail = true;
    await advance(30000);
    expect(readVerifications(executeScript)).toBe(2);
    expect(
      getParagraph(
        "A atualização automática falhou: A API do painel não respondeu a tempo. Tente de novo. O resultado mostrado é o da consulta anterior.",
      ),
    ).toBeVisible();
    expect(getCards()[0]).toHaveTextContent("RD Station — Pendente");
    fail = false;
    await advance(30000);
    expect(readVerifications(executeScript)).toBe(3);
    expect(
      screen.queryByText(/A atualização automática falhou/),
    ).not.toBeInTheDocument();
  });

  it("não sobrepõe consultas: o clique durante a atualização espera e prevalece", async () => {
    const finishes: ((value: unknown) => void)[] = [];
    let running = 0;
    let parallel = 0;
    const executeScript = mockPanel(async () => {
      running += 1;
      parallel = Math.max(parallel, running);
      const value = await new Promise((resolve) => {
        finishes.push(resolve);
      });
      running -= 1;

      return value;
    });
    render(<LeadIntegrations autoRefresh history={emptyHistory} />);
    await verifyWithSearch("Caio");
    finishes[0]?.({ ok: true, result: pending });
    await advance(0);
    expect(screen.getByText("1 lead verificado.")).toBeVisible();
    await advance(30000);
    expect(finishes).toHaveLength(2);
    expect(getParagraph("Atualizando automaticamente…")).toBeVisible();
    await verifyWithSearch("");
    expect(finishes).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Verificando integrações…" }),
    ).toBeVisible();
    finishes[1]?.({ ok: true, result: done });
    await advance(0);
    expect(finishes).toHaveLength(3);
    expect(screen.queryByText("RD Station — OK")).not.toBeInTheDocument();
    finishes[2]?.({ ok: true, result: panelReport });
    await advance(0);
    expect(screen.getByText("6 leads verificados.")).toBeVisible();
    expect(parallel).toBe(1);
    expect(readQueries(executeScript)).toEqual([
      { limit: 10, search: "Caio" },
      { limit: 10, search: "Caio" },
      { limit: 10, search: "" },
    ]);
  });

  it("localiza o lead no painel pelo identificador, em destaque no lead com erro", async () => {
    vi.useRealTimers();
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async (injection) => [
        {
          documentId: "document",
          frameId: 0,
          result:
            "files" in injection
              ? injection.files?.[0] === "/lead-focus.js"
                ? {
                    ok: true,
                    result: { detail: "confirmed", row: "highlighted" },
                  }
                : { ok: true, result: panelReport }
              : undefined,
        },
      ]);
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: PANEL_LEADS_URL },
    ]);
    render(<LeadIntegrations history={emptyHistory} />);
    const user = await verify();
    await screen.findByText("6 leads verificados.");
    const cards = getCards();
    const locate = (card: HTMLElement | undefined) =>
      within(card!).getByRole("button", { name: "Localizar no painel" });
    expect(locate(cards[0])).toHaveAccessibleDescription(
      "Teste LT-20261008-141748-012",
    );
    expect(locate(cards[0])).toHaveClass("bg-action-primary");
    expect(locate(cards[1])).not.toHaveClass("bg-action-primary");
    await user.click(locate(cards[0]));
    expect(
      await within(cards[0]!).findByText(
        "Lead localizado: detalhe aberto e linha destacada no painel.",
      ),
    ).toBeVisible();
    const injections = readInjections(executeScript).slice(2);
    expect(injections).toEqual([
      expect.objectContaining({
        args: [
          "leadIntegrationTesterLeadFocus",
          expect.objectContaining({
            accountId: PANEL_ACCOUNT_ID,
            leadId: panelReport.leads[0]?.id,
            search: PANEL_TEST_SUBMISSION_ID,
          }),
          "https://admin.autodromo.com.br",
        ],
      }),
      expect.objectContaining({ files: ["/lead-focus.js"] }),
    ]);
  });

  it("diz quando não localizou o lead e quando o painel não responde", async () => {
    vi.useRealTimers();
    let focus: unknown = {
      ok: true,
      result: { detail: "unconfirmed", row: "missing" },
    };
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async (injection) => [
        {
          documentId: "document",
          frameId: 0,
          result:
            "files" in injection
              ? injection.files?.[0] === "/lead-focus.js"
                ? focus
                : { ok: true, result: panelReport }
              : undefined,
        },
      ],
    );
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: PANEL_LEADS_URL },
    ]);
    render(<LeadIntegrations history={emptyHistory} />);
    const user = await verify();
    await screen.findByText("6 leads verificados.");
    const card = getCards()[1]!;
    const locate = within(card).getByRole("button", {
      name: "Localizar no painel",
    });
    await user.click(locate);
    expect(
      await within(card).findByText(
        "Não foi possível localizar o lead na listagem.",
      ),
    ).toHaveClass("text-feedback-warning");
    focus = undefined;
    await user.click(locate);
    expect(
      await within(card).findByText("O painel retornou uma resposta inválida."),
    ).toHaveClass("text-feedback-error");
  });
});
