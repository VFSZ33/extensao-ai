import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

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
