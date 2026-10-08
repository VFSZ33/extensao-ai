import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubmissionHistory } from "@/components/extension-popup/submission-history";

const submittedAt = new Date(2026, 9, 7, 8, 5, 9).toISOString();

describe("Histórico de envios", () => {
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
    render(<SubmissionHistory history={{ records: [], status: "ready" }} />);
    expect(screen.getByText("Nenhum envio registrado.")).toBeVisible();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("informa o carregamento e a falha de leitura", () => {
    const { rerender } = render(
      <SubmissionHistory history={{ status: "loading" }} />,
    );
    expect(screen.getByText("Carregando histórico…")).toBeVisible();
    rerender(<SubmissionHistory history={{ status: "error" }} />);
    expect(
      screen.getByText("Não foi possível ler o histórico de envios."),
    ).toBeVisible();
  });
});
