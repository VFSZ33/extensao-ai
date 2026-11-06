import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { panelReport } from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import type { SubmissionTracking } from "@/hooks/use-submission-tracking";
import type { VerifiedLead } from "@/lib/integration-status";

import { SubmissionHistory } from "@/components/extension-popup/submission-history";
import {
  addSubmission,
  readSubmissionHistory,
  type SubmissionRecord,
  takeSubmissionSequence,
} from "@/lib/submission-history";

const submittedAt = new Date(2026, 9, 7, 8, 5, 9).toISOString();

function createRecord(id: string): SubmissionRecord {
  return {
    definitionId: "autodromo-offer",
    definitionName: "Formulário de oferta",
    formLabel: "oferta - GEELY EX5 PRO - Enviar",
    id,
    pageUrl: "https://example.com/oferta",
    submittedAt,
    values: {},
  };
}

describe("Histórico de envios", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({
      now: new Date(2026, 9, 8, 8, 0, 0),
      toFake: ["Date"],
    });
  });

  it("mostra identificador, formulário, horário e valores de cada envio", () => {
    render(
      <SubmissionHistory
        history={{
          records: [
            {
              definitionId: "autodromo-offer",
              definitionName: "Formulário de oferta",
              formLabel: "oferta - GEELY EX5 PRO - Enviar",
              id: "LT-20261007-080509-002",
              pageUrl: "https://example.com/oferta",
              submittedAt,
              values: {
                email: "lt-20261007-080509-002@example.com",
                mailing: false,
                placeholder: { label: "Selecione a unidade", value: "" },
                unit: { label: "Unidade Norte", value: "north" },
                whatsapping: true,
              },
            },
            {
              definitionId: "autodromo-section",
              definitionName: "Formulário de seção",
              formLabel: "",
              id: "LT-20261007-080501-001",
              pageUrl: "",
              submittedAt,
              values: {},
            },
          ],
          status: "ready",
        }}
        onCleared={vi.fn()}
      />,
    );
    const items = within(
      screen.getByRole("region", { name: "Histórico de envios" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("LT-20261007-080509-002");
    expect(items[0]).toHaveTextContent(
      "Formulário de oferta · oferta - GEELY EX5 PRO - Enviar",
    );
    expect(items[0]).toHaveTextContent(
      "07/10/2026, 08:05:09 · https://example.com/oferta",
    );
    expect(
      within(items[0]!)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["email", "mailing", "placeholder", "unit", "whatsapping"]);
    expect(
      within(items[0]!)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toEqual([
      "lt-20261007-080509-002@example.com",
      "desmarcado",
      "Selecione a unidade (sem valor)",
      "Unidade Norte (north)",
      "marcado",
    ]);
    expect(items[1]).toHaveTextContent("LT-20261007-080501-001");
    expect(items[1]).toHaveTextContent("Formulário de seção");
  });

  it("informa quando não há envios", () => {
    render(
      <SubmissionHistory
        history={{ records: [], status: "ready" }}
        onCleared={vi.fn()}
      />,
    );
    expect(screen.getByText("Nenhum envio registrado.")).toBeVisible();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Limpar histórico" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("informa o carregamento e a falha de leitura", () => {
    const { rerender } = render(
      <SubmissionHistory history={{ status: "loading" }} onCleared={vi.fn()} />,
    );
    expect(screen.getByText("Carregando histórico…")).toBeVisible();
    rerender(
      <SubmissionHistory history={{ status: "error" }} onCleared={vi.fn()} />,
    );
    expect(
      screen.getByText("Não foi possível ler o histórico de envios."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Limpar histórico" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("informa a política de retenção", () => {
    render(
      <SubmissionHistory
        history={{ records: [], status: "ready" }}
        onCleared={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Guarda neste navegador os 100 envios mais recentes, por até 30 dias.",
      ),
    ).toBeVisible();
  });

  it("limpa o histórico depois da confirmação, sem reiniciar a sequência", async () => {
    await takeSubmissionSequence();
    await addSubmission(createRecord("LT-20261007-080509-001"));
    await addSubmission(createRecord("LT-20261007-080510-002"));
    const onCleared = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmissionHistory
        history={{ records: await readSubmissionHistory(), status: "ready" }}
        onCleared={onCleared}
      />,
    );
    const clear = screen.getByRole("button", { name: "Limpar histórico" });
    await user.click(clear);
    const confirmation = screen.getByRole("group", {
      name: "Limpar o histórico de envios?",
    });
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAccessibleDescription(
      "Os 2 envios registrados serão apagados deste navegador. Os leads continuam nos sites e no painel, e a sequência dos identificadores não recomeça.",
    );
    await user.click(
      within(confirmation).getByRole("button", { name: "Apagar histórico" }),
    );
    expect(await screen.findByText("Histórico limpo.")).toBeVisible();
    expect(confirmation).not.toBeInTheDocument();
    expect(clear).toHaveFocus();
    expect(onCleared).toHaveBeenCalledOnce();
    await expect(readSubmissionHistory()).resolves.toEqual([]);
    await expect(takeSubmissionSequence()).resolves.toBe(2);
  });

  it("cancela a limpeza pelo botão ou pelo Esc, sem apagar", async () => {
    await addSubmission(createRecord("LT-20261007-080509-001"));
    const onCleared = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmissionHistory
        history={{ records: await readSubmissionHistory(), status: "ready" }}
        onCleared={onCleared}
      />,
    );
    const clear = screen.getByRole("button", { name: "Limpar histórico" });
    await user.click(clear);
    expect(
      screen.getByRole("group", { name: "Limpar o histórico de envios?" }),
    ).toHaveAccessibleDescription(
      "O envio registrado será apagado deste navegador. Os leads continuam nos sites e no painel, e a sequência dos identificadores não recomeça.",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(clear).toHaveFocus();
    await user.click(clear);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(clear).toHaveFocus();
    expect(onCleared).not.toHaveBeenCalled();
    await expect(readSubmissionHistory()).resolves.toHaveLength(1);
  });

  it("informa a falha ao limpar e permite tentar de novo", async () => {
    await addSubmission(createRecord("LT-20261007-080509-001"));
    vi.spyOn(browser.storage.local, "remove").mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    const user = userEvent.setup();
    render(
      <SubmissionHistory
        history={{ records: await readSubmissionHistory(), status: "ready" }}
        onCleared={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Limpar histórico" }));
    await user.click(screen.getByRole("button", { name: "Apagar histórico" }));
    expect(
      await screen.findByText(
        "Não foi possível limpar o histórico. Tente de novo.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Limpar histórico" }));
    expect(
      screen.queryByText("Não foi possível limpar o histórico. Tente de novo."),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apagar histórico" }));
    expect(await screen.findByText("Histórico limpo.")).toBeVisible();
    await expect(readSubmissionHistory()).resolves.toEqual([]);
  });
});

describe("Acompanhamento no histórico", () => {
  const id = "LT-20261007-080509-002";
  const lead = panelReport.leads[0] as VerifiedLead;
  const checkedAt = new Date(2026, 9, 7, 8, 6, 0).toISOString();

  function renderTracking(
    tracking: Partial<SubmissionTracking>,
    trackingEnabled = true,
  ) {
    render(
      <SubmissionHistory
        history={{ records: [createRecord(id)], status: "ready" }}
        onCleared={vi.fn()}
        tracking={
          new Map([
            [
              id,
              {
                check: undefined,
                checkedAt: undefined,
                expired: false,
                nextAt: undefined,
                running: false,
                startedAt: 0,
                ...tracking,
              },
            ],
          ])
        }
        trackingEnabled={trackingEnabled}
      />,
    );

    return screen.getByRole("group", { name: "Acompanhamento no painel" });
  }

  it("mostra o status do lead no painel junto do envio, com cada integração", () => {
    const group = renderTracking({
      check: { lead: { ...lead, status: "pending" }, status: "found" },
      checkedAt,
      nextAt: 1,
    });
    expect(group).toHaveTextContent("No painel: Pendente");
    expect(group).toHaveTextContent("My Honda — OK");
    expect(group).toHaveTextContent(
      "RD Station — Erro: Parâmetros incompletos [ 3f9a1c ]",
    );
    expect(group).toHaveTextContent(
      "Consultado em 07/10/2026, 08:06:00; nova consulta a cada 15 s enquanto estiver pendente ou sem evento.",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Histórico de envios" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(1);
  });

  it("mostra a consulta em andamento e o fim do acompanhamento", () => {
    expect(renderTracking({ running: true })).toHaveTextContent(
      "Consultando o painel…",
    );
  });

  it.each<[string, Partial<SubmissionTracking>, string]>([
    [
      "sem painel aberto",
      { check: { status: "no-panel" } },
      "Para acompanhar aqui, abra no painel a lista de leads da conta. Confira em Integrações dos leads, com o painel aberto, buscando por " +
        id +
        ".",
    ],
    [
      "sem acesso ao painel",
      { check: { status: "no-access" } },
      "A extensão não tem acesso à aba do painel: abra o painel lateral nela e permita o acesso.",
    ],
    [
      "com erro da consulta",
      {
        check: {
          message: "A sessão do painel expirou.",
          status: "error",
        },
      },
      "Não foi possível consultar o painel: A sessão do painel expirou. Confira em Integrações dos leads",
    ],
    [
      "sem o lead depois de 5 min",
      { check: { status: "not-found" }, checkedAt, expired: true },
      "O lead ainda não apareceu na conta aberta no painel.Acompanhamento encerrado depois de 5 min.",
    ],
  ])("explica como conferir %s, sem erro", (_case, tracking, text) => {
    const group = renderTracking(tracking);
    expect(group).toHaveTextContent(text);
    expect(within(group).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("avisa que o acompanhamento está pausado com a opção desativada", () => {
    expect(
      renderTracking(
        { check: { status: "not-found" }, checkedAt, nextAt: 1 },
        false,
      ),
    ).toHaveTextContent(
      "Acompanhamento pausado: a atualização automática está desativada.",
    );
  });
});

describe("Unidade no histórico", () => {
  const records: SubmissionRecord[] = [
    {
      ...createRecord("LT-20261007-080509-004"),
      unit: { label: "Unidade Sul", value: "south" },
    },
    {
      ...createRecord("LT-20261007-080509-003"),
      unit: { label: "Unidade Norte", value: "north" },
    },
    {
      ...createRecord("LT-20261007-080509-002"),
      unit: { label: "Unidade Sul", value: "south" },
    },
    createRecord("LT-20261007-080509-001"),
  ];

  function listShownIds(): (null | string)[] {
    return within(screen.getByRole("region", { name: "Histórico de envios" }))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent ?? null);
  }

  it("mostra a unidade de cada envio e lê os registros antigos, sem unidade", () => {
    render(
      <SubmissionHistory
        history={{ records, status: "ready" }}
        onCleared={vi.fn()}
      />,
    );
    const items = within(
      screen.getByRole("region", { name: "Histórico de envios" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Unidade: Unidade Sul");
    expect(items[1]).toHaveTextContent("Unidade: Unidade Norte");
    expect(items[3]).toHaveTextContent("LT-20261007-080509-001");
    expect(items[3]).not.toHaveTextContent("Unidade:");
  });

  it("filtra por unidade, com Todas por padrão e a opção dos envios sem unidade", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionHistory
        history={{ records, status: "ready" }}
        onCleared={vi.fn()}
      />,
    );
    const filter = screen.getByRole("combobox", {
      name: "Filtrar por unidade",
    });
    expect(filter).toHaveTextContent("Todas");
    expect(listShownIds()).toHaveLength(4);
    await user.click(filter);
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Todas", "Unidade Norte", "Unidade Sul", "Sem unidade"]);
    await user.click(screen.getByRole("option", { name: "Unidade Sul" }));
    expect(listShownIds()).toEqual([
      "LT-20261007-080509-004",
      "LT-20261007-080509-002",
    ]);
    expect(screen.getByText("Mostrando 2 de 4 envios.")).toBeVisible();
    await user.click(filter);
    await user.click(
      await screen.findByRole("option", { name: "Sem unidade" }),
    );
    expect(listShownIds()).toEqual(["LT-20261007-080509-001"]);
    await user.click(filter);
    await user.click(await screen.findByRole("option", { name: "Todas" }));
    expect(listShownIds()).toHaveLength(4);
    expect(screen.queryByText(/^Mostrando/)).not.toBeInTheDocument();
  });

  it("volta a Todas quando a unidade filtrada deixa de existir no histórico", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SubmissionHistory
        history={{ records, status: "ready" }}
        onCleared={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("combobox", { name: "Filtrar por unidade" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Unidade Norte" }),
    );
    expect(listShownIds()).toEqual(["LT-20261007-080509-003"]);
    rerender(
      <SubmissionHistory
        history={{
          records: records.filter(({ unit }) => unit?.value !== "north"),
          status: "ready",
        }}
        onCleared={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Filtrar por unidade" }),
    ).toHaveTextContent("Todas");
    expect(listShownIds()).toHaveLength(3);
  });

  it("não mostra o filtro quando nenhum envio tem unidade", () => {
    render(
      <SubmissionHistory
        history={{
          records: [createRecord("LT-20261007-080509-001")],
          status: "ready",
        }}
        onCleared={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("combobox", { name: "Filtrar por unidade" }),
    ).not.toBeInTheDocument();
  });
});
