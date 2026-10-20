import {
  createPanelCookies,
  createPanelToken,
  PANEL_ACTOR_EMAIL,
  panelReport,
} from "@tests/fixtures/panel";
import { describe, expect, it } from "vitest";

import type { LeadIntegrationReport } from "@/lib/integration-status";

import { formatDateTime } from "@/lib/date-time";
import {
  createDiagnosticReport,
  describeIncompleteness,
  redactPersonalData,
} from "@/lib/integration-report";

const CHECKED_AT = new Date(2026, 9, 19, 15, 30, 12).toISOString();
const report = panelReport as LeadIntegrationReport;

describe("Relatório de diagnóstico", () => {
  it("resume a consulta e descreve cada lead e cada integração", () => {
    const [test, bruna, caio, dora, brunaOld, enzo] = report.leads;
    expect(
      createDiagnosticReport({
        checkedAt: CHECKED_AT,
        query: { limit: 10, search: "" },
        report,
      }),
    ).toBe(
      [
        "Diagnóstico das integrações — Scanner de Leads",
        "Consulta: 19/10/2026, 15:30:12",
        "Escopo: os 10 leads mais recentes da conta",
        "Leads devolvidos: 6",
        "Situação: incompleta — 1 lead ficou sem consulta ao histórico de integrações",
        "Por status: Erro 1, Não confirmado 1, Pendente 1, Não consultado 1, OK 1, Sem evento 1",
        "",
        "Lead 1 de 6",
        "Identificador: 00000000-0000-4000-8000-000000000001",
        "Nome: Teste LT-20261008-141748-012",
        "Criado em: " + formatDateTime(test?.createdAt ?? ""),
        "Status: Erro",
        "- My Honda: OK",
        "- RD Station: Erro — Parâmetros incompletos [ 3f9a1c ]",
        "",
        "Lead 2 de 6",
        "Identificador: 00000000-0000-4000-8000-000000000002",
        "Nome: Bruna Exemplo",
        "Criado em: " + formatDateTime(bruna?.createdAt ?? ""),
        "Status: OK",
        "- Syonet: OK",
        "",
        "Lead 3 de 6",
        "Identificador: 00000000-0000-4000-8000-000000000003",
        "Nome: Caio Fictício",
        "Criado em: " + formatDateTime(caio?.createdAt ?? ""),
        "Status: Pendente",
        "- RD Station: Pendente",
        "",
        "Lead 4 de 6",
        "Identificador: 00000000-0000-4000-8000-000000000004",
        "Nome: Dora Modelo",
        "Criado em: " + formatDateTime(dora?.createdAt ?? ""),
        "Status: Sem evento",
        "- Nenhum evento de integração para este lead.",
        "",
        "Lead 5 de 6",
        "Identificador: 00000000-0000-4000-8000-000000000005",
        "Nome: Bruna Exemplo",
        "Criado em: " + formatDateTime(brunaOld?.createdAt ?? ""),
        "Status: Não confirmado",
        "- My Honda: OK",
        "- RD Station: Não confirmado — há tentativas posteriores que podem ser de outro lead do mesmo contato",
        "",
        "Lead 6 de 6",
        "Identificador: 00000000-0000-4000-8000-000000000006",
        "Nome: Enzo Amostra",
        "Criado em: " + formatDateTime(enzo?.createdAt ?? ""),
        "Status: Não consultado — A API do painel respondeu com erro (HTTP 500).",
      ].join("\n"),
    );
  });

  it("não traz e-mail, telefone, CPF, token nem cookie", () => {
    const cookies = createPanelCookies({ expiresAt: Date.now() + 3600000 });
    const accessToken =
      cookies.find(({ name }) => name.endsWith(".accessToken"))?.value ?? "";
    const text = createDiagnosticReport({
      checkedAt: CHECKED_AT,
      query: { limit: 20, search: "bruna.exemplo@example.com" },
      report: {
        leads: [
          {
            ...(report.leads[0] as LeadIntegrationReport["leads"][number]),
            integrations: [
              {
                message:
                  "Recusado para joana@example.com, (11) 98765-4321, CPF 123.456.789-09, Bearer " +
                  accessToken,
                name: "RD Station",
                reason: "",
                status: "error",
              },
              {
                message: "",
                name: "Syonet " + createPanelToken({ sub: "integracao-x" }),
                reason: "há tentativas posteriores",
                status: "not-confirmed",
              },
            ],
            name: "joana@example.com +55 11 98765-4321",
          },
          ...report.leads.slice(1),
        ],
        missingLeads: 0,
      },
    });

    for (const secret of [
      ...report.leads.flatMap(({ email, phone }) => [email, phone]),
      "joana@example.com",
      "98765-4321",
      "123.456.789-09",
      "bruna.exemplo@example.com",
      accessToken,
      ...accessToken.split("."),
      "Bearer",
      PANEL_ACTOR_EMAIL,
      "CognitoIdentityServiceProvider",
    ]) {
      expect(text).not.toContain(secret);
    }

    expect(text).toContain("Escopo: busca na API por “[e-mail omitido]”");
    expect(text).toContain(
      "- RD Station: Erro — Recusado para [e-mail omitido], [número omitido], CPF [número omitido], [token omitido]",
    );
    expect(text).toContain(
      "- Syonet [token omitido]: Não confirmado — há tentativas posteriores",
    );
    expect(text).toContain("Nome: [e-mail omitido] [número omitido]");
    expect(text).toContain("Nome: Bruna Exemplo");
  });

  it("indica a busca, a consulta completa e o lead sem nome", () => {
    const text = createDiagnosticReport({
      checkedAt: CHECKED_AT,
      query: { limit: 5, search: "LT-20261008-1417" },
      report: {
        leads: [
          {
            ...(report.leads[0] as LeadIntegrationReport["leads"][number]),
            integrations: [
              { message: "", name: "", reason: "", status: "error" },
            ],
            name: "",
          },
        ],
        missingLeads: 0,
      },
    });
    expect(text).toContain(
      "Escopo: busca na API por “LT-20261008-1417”, até 5 leads",
    );
    expect(text).toContain("Leads devolvidos: 1");
    expect(text).toContain("Situação: concluída");
    expect(text).toContain("Nome: sem nome");
    expect(text).toContain(
      "- Integração sem nome: Erro — motivo não informado pela API",
    );
  });

  it("descreve o que deixou a consulta incompleta", () => {
    expect(describeIncompleteness({ leads: [], missingLeads: 0 })).toEqual([]);
    expect(
      describeIncompleteness({
        leads: report.leads.map((lead) => ({
          ...lead,
          status: "unavailable",
        })),
        missingLeads: 1,
      }),
    ).toEqual([
      "6 leads ficaram sem consulta ao histórico de integrações",
      "a API deixou de devolver 1 lead que informou existir",
    ]);
    expect(describeIncompleteness({ leads: [], missingLeads: 3 })).toEqual([
      "a API deixou de devolver 3 leads que informou existir",
    ]);
  });

  it.each([
    ["Lead enviado.", "Lead enviado."],
    ["HTTP 500", "HTTP 500"],
    ["Parâmetros incompletos [ 3f9a1c ]", "Parâmetros incompletos [ 3f9a1c ]"],
    ["Teste LT-20261008-141748-012", "Teste LT-20261008-141748-012"],
    ["LT-20261008-1417", "LT-20261008-1417"],
    ["Falhou em 2026-10-08 17:17:48", "Falhou em 2026-10-08 17:17:48"],
    [
      "Falhou em 2026-10-08T17:17:48.859Z",
      "Falhou em 2026-10-08T17:17:48.859Z",
    ],
    [
      "Pedido 00000000-0000-4000-8000-000000000001",
      "Pedido 00000000-0000-4000-8000-000000000001",
    ],
    ["ligue 11900000001.", "ligue [número omitido]."],
    ["ligue (11) 90000-0001", "ligue [número omitido]"],
    ["CPF 12345678909", "CPF [número omitido]"],
    [
      '{"phone":11999998888,"cpf":12345678909}',
      '{"phone":[número omitido],"cpf":[número omitido]}',
    ],
    [
      '{"phone":"(11) 99999-8888","cpf":"123.456.789-09"}',
      '{"phone":"[número omitido]","cpf":"[número omitido]"}',
    ],
    [
      "cpf:12345678909 telefone:11999998888",
      "cpf:[número omitido] telefone:[número omitido]",
    ],
    ["tel:+55 (11) 99999-8888", "tel:[número omitido]"],
    ["CPF 12345678909: inválido", "CPF [número omitido]: inválido"],
    ["telefone 11999998888: inválido", "telefone [número omitido]: inválido"],
    [
      "CPF 123.456.789-09: já cadastrado",
      "CPF [número omitido]: já cadastrado",
    ],
    [
      "Contato (11) 99999-8888: duplicado",
      "Contato [número omitido]: duplicado",
    ],
    [
      "telefones 11999998888 11988887777",
      "telefones [número omitido] [número omitido]",
    ],
    ["(11) 99999-8888 (11) 98888-7777", "[número omitido] [número omitido]"],
    ["CPF 123.456.789-09 11999998888", "CPF [número omitido] [número omitido]"],
    ["Erro 4220 11999998888", "Erro 4220 [número omitido]"],
    [
      "+55 11 98765-4321 e 5511987654321",
      "[número omitido] e [número omitido]",
    ],
    ["Protocolo 123456789012345", "Protocolo 123456789012345"],
    ["às 17:17:48 do dia 08/10/2026", "às 17:17:48 do dia 08/10/2026"],
    [
      "id:00000000-0000-4000-8000-000000000001",
      "id:00000000-0000-4000-8000-000000000001",
    ],
    [
      "em:2026-10-08T17:17:48.859Z às 17:17:48",
      "em:2026-10-08T17:17:48.859Z às 17:17:48",
    ],
    ["data:2026-10-08 17:17:48", "data:2026-10-08 17:17:48"],
    ["contato: a.b+c@example.com.br", "contato: [e-mail omitido]"],
    ["authorization: bearer abc.def", "authorization: [token omitido]"],
  ])("trata o texto %j", (text, expected) => {
    expect(redactPersonalData(text)).toBe(expected);
  });
});
