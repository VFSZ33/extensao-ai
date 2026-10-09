import { describe, expect, it } from "vitest";

import {
  classifyLeads,
  countLeadsByStatus,
  type IntegrationEvent,
  isLeadIntegrationReport,
  type PanelLead,
  type VerifiedLead,
} from "@/lib/integration-status";

const CONTACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function classifyOne(events: IntegrationEvent[]): undefined | VerifiedLead {
  return classifyLeads(
    [createLead("lead", "2026-10-06T18:14:30.500Z")],
    new Map([[CONTACT_ID, events]]),
  )[0];
}

function createEvent(
  createdAt: string,
  type: string,
  title: string,
  body = "",
): IntegrationEvent {
  return { body, createdAt, title, type };
}

function createLead(
  id: string,
  createdAt: string,
  contactId: string | undefined = CONTACT_ID,
): PanelLead {
  return {
    contactId,
    createdAt,
    email: id + "@example.com",
    id,
    name: "Lead " + id,
    phone: "11900000000",
  };
}

function createVerifiedLead(status: VerifiedLead["status"]): VerifiedLead {
  return {
    createdAt: "2026-10-06T18:14:30.500Z",
    email: "lead@example.com",
    id: "lead-" + status,
    integrations: [],
    name: "Lead",
    phone: "11900000000",
    status,
  };
}

describe("Status das integrações", () => {
  it("classifica a sequência observada, com nova tentativa que falha de novo", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
        createEvent(
          "2026-10-06T18:14:30.761Z",
          "ERROR",
          "RD Station",
          "Parâmetros incompletos",
        ),
        createEvent("2026-10-06T18:14:30.929Z", "INFO", "My Honda"),
        createEvent(
          "2026-10-06T18:14:31.253Z",
          "SUCCESS",
          "My Honda",
          "Lead enviado com sucesso.",
        ),
        createEvent("2026-10-06T19:06:08.640Z", "INFO", "RD Station"),
        createEvent(
          "2026-10-06T19:06:08.659Z",
          "ERROR",
          "RD Station",
          "Parâmetros incompletos [ 3f9a1c ]",
        ),
      ]),
    ).toEqual({
      createdAt: "2026-10-06T18:14:30.500Z",
      email: "lead@example.com",
      id: "lead",
      integrations: [
        { message: "", name: "My Honda", status: "ok" },
        {
          message: "Parâmetros incompletos [ 3f9a1c ]",
          name: "RD Station",
          status: "error",
        },
      ],
      name: "Lead lead",
      phone: "11900000000",
      status: "error",
    });
  });

  it("ordena os eventos pelo horário antes de decidir", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T19:06:08.659Z", "SUCCESS", "RD Station"),
        createEvent("2026-10-06T19:06:08.640Z", "INFO", "RD Station"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station", "Falha"),
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
      ]),
    ).toMatchObject({
      integrations: [{ message: "", name: "RD Station", status: "ok" }],
      status: "ok",
    });
  });

  it("trata o reenvio manual como a mesma integração", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station", "Falha"),
        createEvent(
          "2026-10-06T19:06:08.640Z",
          "INFO",
          "Reenvio manual - RD Station",
        ),
        createEvent(
          "2026-10-06T19:06:08.659Z",
          "SUCCESS",
          "Reenvio manual - RD Station",
        ),
      ]),
    ).toMatchObject({
      integrations: [{ message: "", name: "RD Station", status: "ok" }],
      status: "ok",
    });
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "RD Station"),
        createEvent(
          "2026-10-06T19:06:08.659Z",
          "ERROR",
          "Reenvio manual - RD Station",
          "Falha no reenvio",
        ),
      ]),
    ).toMatchObject({
      integrations: [
        { message: "Falha no reenvio", name: "RD Station", status: "error" },
      ],
      status: "error",
    });
  });

  it("deixa pendente a integração que só tem eventos informativos", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "Syonet"),
        createEvent("2026-10-06T18:14:30.929Z", "INFO", "My Honda"),
        createEvent("2026-10-06T18:14:31.253Z", "SUCCESS", "My Honda"),
      ]),
    ).toMatchObject({
      integrations: [
        { message: "", name: "My Honda", status: "ok" },
        { message: "", name: "Syonet", status: "pending" },
      ],
      status: "pending",
    });
  });

  it("mantém o resultado conclusivo quando uma nova tentativa não terminou", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "Syonet"),
        createEvent("2026-10-06T19:06:08.640Z", "INFO", "Syonet"),
      ]),
    ).toMatchObject({
      integrations: [{ name: "Syonet", status: "ok" }],
      status: "ok",
    });
  });

  it("trata um tipo desconhecido como erro, com o motivo da API", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "Syonet"),
        createEvent(
          "2026-10-06T18:14:30.761Z",
          "WARNING",
          "Syonet",
          "Fila indisponível",
        ),
      ]),
    ).toMatchObject({
      integrations: [
        { message: "Fila indisponível", name: "Syonet", status: "error" },
      ],
      status: "error",
    });
  });

  it("marca sem evento o lead de histórico vazio", () => {
    expect(classifyOne([])).toMatchObject({
      integrations: [],
      status: "no-events",
    });
  });

  it("marca como não consultado o lead sem histórico disponível", () => {
    expect(
      classifyLeads(
        [
          createLead("sem-historico", "2026-10-06T18:14:30.500Z"),
          createLead("sem-contato", "2026-10-06T18:00:00.000Z", undefined),
        ],
        new Map(),
      ),
    ).toMatchObject([
      { id: "sem-historico", integrations: [], status: "unavailable" },
      { id: "sem-contato", integrations: [], status: "unavailable" },
    ]);
  });

  it("separa os eventos de um contato entre os leads dele", () => {
    const leads = [
      createLead("novo", "2026-10-08T16:00:00.000Z"),
      createLead("outro-contato", "2026-10-07T10:00:00.000Z", "outro"),
      createLead("antigo", "2026-10-06T18:14:30.500Z"),
    ];
    const events = [
      createEvent("2026-10-08T16:00:00.900Z", "SUCCESS", "Syonet"),
      createEvent("2026-10-08T16:00:00.400Z", "INFO", "Syonet"),
      createEvent("2026-10-06T19:06:08.659Z", "ERROR", "RD Station", "Falha"),
      createEvent("2026-10-06T18:14:31.253Z", "SUCCESS", "My Honda"),
      createEvent("2026-10-01T09:00:00.000Z", "ERROR", "Syonet", "Antiga"),
    ];
    expect(
      classifyLeads(
        leads,
        new Map([
          ["outro", []],
          [CONTACT_ID, events],
        ]),
      ),
    ).toMatchObject([
      {
        id: "novo",
        integrations: [{ message: "", name: "Syonet", status: "ok" }],
        status: "ok",
      },
      { id: "outro-contato", integrations: [], status: "no-events" },
      {
        id: "antigo",
        integrations: [
          { message: "", name: "My Honda", status: "ok" },
          { message: "Falha", name: "RD Station", status: "error" },
        ],
        status: "error",
      },
    ]);
  });

  it("atribui ao lead o evento do mesmo instante e ao seguinte o do instante dele", () => {
    expect(
      classifyLeads(
        [
          createLead("novo", "2026-10-08T16:00:00.000Z"),
          createLead("antigo", "2026-10-06T18:14:30.500Z"),
        ],
        new Map([
          [
            CONTACT_ID,
            [
              createEvent("2026-10-08T16:00:00.000Z", "SUCCESS", "Syonet"),
              createEvent("2026-10-06T18:14:30.500Z", "SUCCESS", "My Honda"),
            ],
          ],
        ]),
      ),
    ).toMatchObject([
      { id: "novo", integrations: [{ name: "Syonet" }] },
      { id: "antigo", integrations: [{ name: "My Honda" }] },
    ]);
  });

  it("conta os leads por status", () => {
    expect(
      countLeadsByStatus([
        createVerifiedLead("error"),
        createVerifiedLead("ok"),
        createVerifiedLead("error"),
        createVerifiedLead("unavailable"),
      ]),
    ).toEqual({ error: 2, "no-events": 0, ok: 1, pending: 0, unavailable: 1 });
  });

  it("aceita o relatório classificado", () => {
    expect(isLeadIntegrationReport({ leads: [] })).toBe(true);
    expect(
      isLeadIntegrationReport({
        leads: [
          {
            ...createVerifiedLead("error"),
            integrations: [
              { message: "Falha", name: "RD Station", status: "error" },
            ],
          },
          createVerifiedLead("no-events"),
        ],
      }),
    ).toBe(true);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { leads: [null] },
    { leads: [{ ...createVerifiedLead("ok"), status: "outro" }] },
    { leads: [{ ...createVerifiedLead("ok"), status: "toString" }] },
    { leads: [{ ...createVerifiedLead("ok"), createdAt: "ontem" }] },
    { leads: [{ ...createVerifiedLead("ok"), email: null }] },
    { leads: [{ ...createVerifiedLead("ok"), integrations: [{}] }] },
    {
      leads: [
        {
          ...createVerifiedLead("ok"),
          integrations: [{ message: "", name: "RD", status: "no-events" }],
        },
      ],
    },
  ])("rejeita o relatório inválido %j", (report) => {
    expect(isLeadIntegrationReport(report)).toBe(false);
  });
});
