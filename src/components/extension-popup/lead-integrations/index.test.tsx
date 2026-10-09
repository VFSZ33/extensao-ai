import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PANEL_LEADS_URL,
  PANEL_TEST_SUBMISSION_ID,
  panelReport,
} from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { SubmissionHistoryProps } from "@/components/extension-popup/submission-history";

import { LeadIntegrations } from "@/components/extension-popup/lead-integrations";

const emptyHistory: SubmissionHistoryProps["history"] = {
  records: [],
  status: "ready",
};
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

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
    .mockImplementation(async () => [
      { documentId: "document", frameId: 0, result: await respond() },
    ]);
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

  it("não acessa o painel antes do clique", () => {
    const executeScript = mockPanel(() => ({ ok: true, result: panelReport }));
    render(<LeadIntegrations history={emptyHistory} />);
    expect(
      screen.getByRole("region", { name: "Integrações dos leads" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verificar integrações" }),
    ).toBeEnabled();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
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
      "OK: 2",
      "Erro: 1",
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
    ).toEqual(["My Honda — OK", "RD Station — OK"]);
    expect(cards[5]).toHaveTextContent("Não consultado");
    expect(cards[5]).toHaveTextContent(
      "Não foi possível consultar as integrações deste lead.",
    );
  });

  it("mostra o horário local de criação de cada lead", async () => {
    const createdAt = new Date(2026, 9, 8, 14, 17, 48).toISOString();
    mockPanel(() => ({
      ok: true,
      result: { leads: [{ ...panelReport.leads[1], createdAt }] },
    }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(await screen.findByText("1 lead verificado.")).toBeVisible();
    expect(screen.getByText("08/10/2026, 14:17:48")).toHaveAttribute(
      "dateTime",
      createdAt,
    );
    expect(
      listTexts(screen.getByRole("list", { name: "Resumo por status" })),
    ).toEqual(["OK: 1", "Erro: 0", "Pendente: 0", "Sem evento: 0"]);
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
              { message: "", name: "My Honda", status: "error" },
              {
                message: "<img alt='x' src='x'>",
                name: "<b>RD</b>",
                status: "error",
              },
            ],
            name: "",
          },
        ],
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
    mockPanel(() => ({ ok: true, result: { leads: [] } }));
    render(<LeadIntegrations history={emptyHistory} />);
    await verify();
    expect(await screen.findByText("Esta conta não tem leads.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("mostra o erro da verificação e permite tentar de novo", async () => {
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
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
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

  it("impede outra verificação enquanto uma está em andamento", async () => {
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
    await user.click(verifying);
    expect(executeScript).toHaveBeenCalledTimes(1);
    finish({ ok: true, result: panelReport });
    expect(await screen.findByText("6 leads verificados.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verificar integrações" }),
    ).toHaveFocus();
  });
});
