import { describe, expect, it } from "vitest";

import {
  classifyLeads,
  countLeadsByStatus,
  type HistoryReading,
  type IntegrationEvent,
  isLeadIntegrationReport,
  type PanelLead,
  type VerifiedLead,
} from "@/lib/integration-status";

type ContactDates = Pick<PanelLead, "contactCreatedAt" | "contactUpdatedAt">;

const CONTACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LATER_REASON =
  "há tentativas posteriores que podem ser de outro lead do mesmo contato";
const LEAD_CREATED_AT = "2026-10-06T18:14:30.500Z";
const NO_AUTOMATIC_REASON =
  "não houve tentativa nos 60 s após a criação do lead, e as tentativas seguintes podem ser de outro lead do mesmo contato";
const SINGLE_LEAD_CONTACT: ContactDates = {
  contactCreatedAt: "2026-10-06T18:14:30.503Z",
  contactUpdatedAt: "2026-10-06T18:14:30.503Z",
};
const UNKNOWN_CONTACT: ContactDates = {
  contactCreatedAt: undefined,
  contactUpdatedAt: undefined,
};

function classifyOne(
  events: IntegrationEvent[],
  contact: ContactDates = SINGLE_LEAD_CONTACT,
  partialList = false,
): undefined | VerifiedLead {
  return classifyLeads(
    [createLead("lead", LEAD_CREATED_AT, CONTACT_ID, contact)],
    new Map([[CONTACT_ID, ready(events)]]),
    { partialList },
  )[0];
}

function createEvent(
  createdAt: string,
  type: string,
  title: string,
  body = "",
  id?: string,
): IntegrationEvent {
  return { body, createdAt, id, title, type };
}

function createLead(
  id: string,
  createdAt: string,
  contactId: null | string = CONTACT_ID,
  contact: ContactDates = UNKNOWN_CONTACT,
): PanelLead {
  return {
    ...contact,
    contactId: contactId ?? undefined,
    createdAt,
    email: id + "@example.com",
    id,
    name: "Lead " + id,
    phone: "11900000000",
  };
}

function createVerifiedLead(status: VerifiedLead["status"]): VerifiedLead {
  return {
    createdAt: LEAD_CREATED_AT,
    email: "lead@example.com",
    id: "lead-" + status,
    integrations: [],
    name: "Lead",
    phone: "11900000000",
    reason: "",
    status,
  };
}

function ready(events: IntegrationEvent[]): HistoryReading {
  return { events, status: "ready" };
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
      createdAt: LEAD_CREATED_AT,
      email: "lead@example.com",
      id: "lead",
      integrations: [
        { message: "", name: "My Honda", reason: "", status: "ok" },
        {
          message: "Parâmetros incompletos [ 3f9a1c ]",
          name: "RD Station",
          reason: "",
          status: "error",
        },
      ],
      name: "Lead lead",
      phone: "11900000000",
      reason: "",
      status: "error",
    });
  });

  it("confirma o sucesso da tentativa automática", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.929Z", "INFO", "My Honda"),
        createEvent("2026-10-06T18:14:31.253Z", "SUCCESS", "My Honda"),
      ]),
    ).toMatchObject({
      integrations: [{ message: "", name: "My Honda", status: "ok" }],
      status: "ok",
    });
  });

  it("aponta a falha da tentativa automática com o motivo da API", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
        createEvent(
          "2026-10-06T18:14:30.761Z",
          "ERROR",
          "RD Station",
          "Parâmetros incompletos",
        ),
      ]),
    ).toMatchObject({
      integrations: [
        {
          message: "Parâmetros incompletos",
          name: "RD Station",
          status: "error",
        },
      ],
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

  it("não usa o sucesso antigo para confirmar uma nova tentativa que não terminou", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "Syonet"),
        createEvent("2026-10-06T19:06:08.640Z", "INFO", "Syonet"),
      ]),
    ).toMatchObject({
      integrations: [{ name: "Syonet", reason: "", status: "pending" }],
      status: "pending",
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
      reason: "",
      status: "no-events",
    });
  });

  it("marca como não consultado o lead sem histórico disponível, com o motivo", () => {
    expect(
      classifyLeads(
        [
          createLead("sem-historico", LEAD_CREATED_AT),
          createLead("sem-contato", "2026-10-06T18:00:00.000Z", null),
          createLead(
            "com-falha",
            "2026-10-06T17:00:00.000Z",
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          ),
        ],
        new Map([
          [
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            {
              reason: "A API do painel respondeu com erro (HTTP 500).",
              status: "unavailable",
            },
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      {
        id: "sem-historico",
        integrations: [],
        reason: "O histórico deste contato não foi consultado.",
        status: "unavailable",
      },
      {
        id: "sem-contato",
        integrations: [],
        reason: "A API não informou o contato deste lead.",
        status: "unavailable",
      },
      {
        id: "com-falha",
        integrations: [],
        reason: "A API do painel respondeu com erro (HTTP 500).",
        status: "unavailable",
      },
    ]);
  });

  it("separa os eventos de um contato entre os leads dele", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-08T16:00:00.004Z",
    };
    const leads = [
      createLead("novo", "2026-10-08T16:00:00.000Z", CONTACT_ID, contact),
      createLead("outro-contato", "2026-10-07T10:00:00.000Z", "outro"),
      createLead("antigo", LEAD_CREATED_AT, CONTACT_ID, contact),
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
          ["outro", ready([])],
          [CONTACT_ID, ready(events)],
        ]),
        { partialList: false },
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
          {
            message: "",
            name: "RD Station",
            reason: NO_AUTOMATIC_REASON,
            status: "not-confirmed",
          },
        ],
        status: "not-confirmed",
      },
    ]);
  });

  it("atribui ao lead o evento do mesmo instante e ao seguinte o do instante dele", () => {
    expect(
      classifyLeads(
        [
          createLead("novo", "2026-10-08T16:00:00.000Z"),
          createLead("antigo", LEAD_CREATED_AT),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-08T16:00:00.000Z", "SUCCESS", "Syonet"),
              createEvent(LEAD_CREATED_AT, "SUCCESS", "My Honda"),
            ]),
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      { id: "novo", integrations: [{ name: "Syonet" }] },
      { id: "antigo", integrations: [{ name: "My Honda" }] },
    ]);
  });

  describe("sem evidência de que o contato tem só este lead", () => {
    it("não confirma a integração cuja tentativa posterior muda o resultado", () => {
      expect(
        classifyOne(
          [
            createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station"),
            createEvent("2026-10-06T19:06:08.659Z", "SUCCESS", "RD Station"),
          ],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [
          {
            message: "",
            name: "RD Station",
            reason: LATER_REASON,
            status: "not-confirmed",
          },
        ],
        status: "not-confirmed",
      });
    });

    it("não confirma a integração que só tem tentativas posteriores", () => {
      expect(
        classifyOne(
          [createEvent("2026-10-06T19:06:08.659Z", "SUCCESS", "RD Station")],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [
          {
            name: "RD Station",
            reason: NO_AUTOMATIC_REASON,
            status: "not-confirmed",
          },
        ],
        status: "not-confirmed",
      });
    });

    it("não confirma o sucesso antigo diante de uma tentativa posterior sem conclusão", () => {
      expect(
        classifyOne(
          [
            createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "Syonet"),
            createEvent("2026-10-06T19:06:08.640Z", "INFO", "Syonet"),
          ],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [{ name: "Syonet", status: "not-confirmed" }],
        status: "not-confirmed",
      });
    });

    it("mantém o resultado da tentativa automática quando a posterior não o muda", () => {
      expect(
        classifyOne(
          [
            createEvent(
              "2026-10-06T18:14:30.761Z",
              "ERROR",
              "RD Station",
              "Falha automática",
            ),
            createEvent(
              "2026-10-06T19:06:08.659Z",
              "ERROR",
              "RD Station",
              "Falha posterior",
            ),
          ],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [
          {
            message: "Falha automática",
            name: "RD Station",
            reason: "",
            status: "error",
          },
        ],
        status: "error",
      });
    });

    it("conta como automática só a tentativa inteira nos 60 s depois da criação", () => {
      expect(
        classifyOne(
          [createEvent("2026-10-06T18:15:30.500Z", "SUCCESS", "RD Station")],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({ integrations: [{ status: "ok" }], status: "ok" });
      expect(
        classifyOne(
          [createEvent("2026-10-06T18:15:30.501Z", "SUCCESS", "RD Station")],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [
          { reason: NO_AUTOMATIC_REASON, status: "not-confirmed" },
        ],
        status: "not-confirmed",
      });
      expect(
        classifyOne(
          [
            createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
            createEvent("2026-10-06T18:16:30.761Z", "SUCCESS", "RD Station"),
          ],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
        status: "not-confirmed",
      });
    });

    it("trata como posterior a tentativa seguinte da mesma integração dentro da janela", () => {
      const events = [
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station"),
        createEvent("2026-10-06T18:15:00.739Z", "INFO", "RD Station"),
        createEvent("2026-10-06T18:15:00.761Z", "SUCCESS", "RD Station"),
      ];
      expect(classifyOne(events, UNKNOWN_CONTACT)).toMatchObject({
        integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
        status: "not-confirmed",
      });
      expect(classifyOne(events)).toMatchObject({
        integrations: [{ reason: "", status: "ok" }],
        status: "ok",
      });
    });

    it("trata como posterior o reenvio manual dentro da janela", () => {
      const events = [
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station"),
        createEvent(
          "2026-10-06T18:14:50.761Z",
          "SUCCESS",
          "Reenvio manual - RD Station",
        ),
      ];
      expect(classifyOne(events, UNKNOWN_CONTACT)).toMatchObject({
        integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
        status: "not-confirmed",
      });
      expect(classifyOne(events)).toMatchObject({
        integrations: [{ status: "ok" }],
        status: "ok",
      });
      expect(
        classifyOne(
          [
            createEvent(
              "2026-10-06T18:14:30.761Z",
              "SUCCESS",
              "Reenvio manual - RD Station",
            ),
          ],
          UNKNOWN_CONTACT,
        ),
      ).toMatchObject({
        integrations: [
          { reason: NO_AUTOMATIC_REASON, status: "not-confirmed" },
        ],
      });
    });
  });

  it("não atribui ao lead mais novo o reenvio manual dentro da janela dele, que pode ser do lead anterior", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-06T18:19:30.503Z",
    };
    expect(
      classifyLeads(
        [
          createLead("l2", "2026-10-06T18:19:30.500Z", CONTACT_ID, contact),
          createLead("l1", LEAD_CREATED_AT, CONTACT_ID, contact),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-06T18:14:31.000Z", "SUCCESS", "CRM X"),
              createEvent("2026-10-06T18:19:31.000Z", "ERROR", "CRM X"),
              createEvent(
                "2026-10-06T18:21:30.500Z",
                "INFO",
                "Reenvio manual - CRM X",
              ),
              createEvent(
                "2026-10-06T18:21:30.900Z",
                "SUCCESS",
                "Reenvio manual - CRM X",
              ),
            ]),
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      {
        id: "l2",
        integrations: [
          { name: "CRM X", reason: LATER_REASON, status: "not-confirmed" },
        ],
        status: "not-confirmed",
      },
      {
        id: "l1",
        integrations: [{ name: "CRM X", status: "ok" }],
        status: "ok",
      },
    ]);
  });

  it("não toma como do lead a tentativa que começa mais de 60 s depois dele sem evidência de lead único", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.500Z",
      contactUpdatedAt: "2026-10-06T18:34:30.500Z",
    };
    const lead = createLead("l1", LEAD_CREATED_AT, CONTACT_ID, contact);
    const classify = (events: IntegrationEvent[], partialList = true) =>
      classifyLeads([lead], new Map([[CONTACT_ID, ready(events)]]), {
        partialList,
      })[0];
    expect(
      classify([createEvent("2026-10-06T18:17:31.000Z", "SUCCESS", "CRM X")]),
    ).toMatchObject({
      integrations: [
        {
          name: "CRM X",
          reason: NO_AUTOMATIC_REASON,
          status: "not-confirmed",
        },
      ],
      status: "not-confirmed",
    });
    expect(
      classify([createEvent("2026-10-06T18:15:30.500Z", "SUCCESS", "CRM X")]),
    ).toMatchObject({ integrations: [{ status: "ok" }], status: "ok" });
    expect(
      classify([createEvent("2026-10-06T18:15:30.501Z", "SUCCESS", "CRM X")]),
    ).toMatchObject({
      integrations: [{ status: "not-confirmed" }],
      status: "not-confirmed",
    });
    expect(
      classify(
        [createEvent("2026-10-06T18:17:31.000Z", "SUCCESS", "CRM X")],
        false,
      ),
    ).toMatchObject({
      integrations: [{ status: "not-confirmed" }],
      status: "not-confirmed",
    });
  });

  it("com evidência de lead único, vale o conclusivo mais recente depois do lead", () => {
    const events = [
      createEvent("2026-10-06T18:14:30.761Z", "ERROR", "CRM X"),
      createEvent("2026-10-06T18:17:31.000Z", "INFO", "CRM X"),
      createEvent("2026-10-06T18:17:31.400Z", "SUCCESS", "CRM X"),
      createEvent("2026-10-06T18:20:31.000Z", "SUCCESS", "Syonet"),
    ];
    expect(classifyOne(events)).toMatchObject({
      integrations: [
        { name: "CRM X", status: "ok" },
        { name: "Syonet", status: "ok" },
      ],
      status: "ok",
    });
    expect(classifyOne(events, SINGLE_LEAD_CONTACT, true)).toMatchObject({
      integrations: [
        { name: "CRM X", reason: LATER_REASON, status: "not-confirmed" },
        {
          name: "Syonet",
          reason: NO_AUTOMATIC_REASON,
          status: "not-confirmed",
        },
      ],
      status: "not-confirmed",
    });
    expect(classifyOne(events, UNKNOWN_CONTACT)).toMatchObject({
      status: "not-confirmed",
    });
    expect(
      classifyOne(events, {
        contactCreatedAt: "2026-10-06T18:14:30.503Z",
        contactUpdatedAt: "2026-10-06T18:34:30.500Z",
      }),
    ).toMatchObject({ status: "not-confirmed" });
  });

  it("não deixa a tentativa só com INFO absorver a tentativa seguinte, nem numa busca", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.500Z",
      contactUpdatedAt: "2026-10-06T18:34:30.500Z",
    };
    const first = createLead("l1", LEAD_CREATED_AT, CONTACT_ID, contact);
    const second = createLead(
      "l2",
      "2026-10-06T18:17:30.500Z",
      CONTACT_ID,
      contact,
    );
    const third = createLead(
      "l3",
      "2026-10-06T18:34:30.500Z",
      CONTACT_ID,
      contact,
    );
    const histories = new Map([
      [
        CONTACT_ID,
        ready([
          createEvent("2026-10-06T18:14:31.000Z", "INFO", "CRM X"),
          createEvent("2026-10-06T18:17:31.000Z", "INFO", "CRM X"),
          createEvent("2026-10-06T18:17:31.400Z", "SUCCESS", "CRM X"),
          createEvent("2026-10-06T18:34:31.000Z", "INFO", "CRM X"),
          createEvent("2026-10-06T18:34:31.400Z", "SUCCESS", "CRM X"),
        ]),
      ],
    ]);
    expect(
      classifyLeads([first], histories, { partialList: true })[0],
    ).toMatchObject({
      integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
      status: "not-confirmed",
    });
    expect(
      classifyLeads([third, first], histories, { partialList: true }),
    ).toMatchObject([
      { id: "l3", integrations: [{ status: "ok" }], status: "ok" },
      { id: "l1", status: "not-confirmed" },
    ]);
    expect(
      classifyLeads([third, second, first], histories, {
        partialList: false,
      }),
    ).toMatchObject([
      { id: "l3", status: "ok" },
      { id: "l2", status: "ok" },
      { id: "l1", integrations: [{ status: "pending" }], status: "pending" },
    ]);
  });

  it("não toma tentativa posterior sem prefixo de reenvio como automática do lead mais novo", () => {
    const later = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-06T19:14:30.503Z",
    };
    expect(
      classifyLeads(
        [
          createLead("l2", "2026-10-06T19:14:30.500Z", CONTACT_ID, later),
          createLead("l1", LEAD_CREATED_AT, CONTACT_ID, later),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-06T18:14:30.900Z", "INFO", "RD Station"),
              createEvent("2026-10-06T18:14:31.000Z", "ERROR", "RD Station"),
              createEvent("2026-10-06T19:14:30.900Z", "INFO", "Syonet"),
              createEvent("2026-10-06T19:14:31.400Z", "SUCCESS", "Syonet"),
              createEvent("2026-10-06T19:17:30.500Z", "INFO", "RD Station"),
              createEvent("2026-10-06T19:17:30.520Z", "SUCCESS", "RD Station"),
            ]),
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      {
        id: "l2",
        integrations: [
          {
            name: "RD Station",
            reason: NO_AUTOMATIC_REASON,
            status: "not-confirmed",
          },
          { name: "Syonet", status: "ok" },
        ],
        status: "not-confirmed",
      },
      {
        id: "l1",
        integrations: [
          { name: "RD Station", reason: LATER_REASON, status: "not-confirmed" },
        ],
        status: "not-confirmed",
      },
    ]);

    const close = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-06T18:19:30.503Z",
    };
    expect(
      classifyLeads(
        [
          createLead("l2", "2026-10-06T18:19:30.500Z", CONTACT_ID, close),
          createLead("l1", LEAD_CREATED_AT, CONTACT_ID, close),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-06T18:14:31.000Z", "SUCCESS", "CRM X"),
              createEvent("2026-10-06T18:19:31.000Z", "INFO", "CRM X"),
              createEvent("2026-10-06T18:21:30.500Z", "INFO", "CRM X"),
              createEvent("2026-10-06T18:21:30.900Z", "SUCCESS", "CRM X"),
            ]),
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      {
        id: "l2",
        integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
        status: "not-confirmed",
      },
      { id: "l1", integrations: [{ status: "ok" }], status: "ok" },
    ]);
  });

  it("numa lista incompleta, não deixa a tentativa de lead omitido confirmar o lead", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.500Z",
      contactUpdatedAt: "2026-10-06T18:34:30.500Z",
    };
    expect(
      classifyLeads(
        [
          createLead("l3", "2026-10-06T18:34:30.500Z", CONTACT_ID, contact),
          createLead("l1", LEAD_CREATED_AT, CONTACT_ID, contact),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-06T18:14:31.000Z", "ERROR", "CRM X"),
              createEvent("2026-10-06T18:17:31.000Z", "SUCCESS", "CRM X"),
              createEvent("2026-10-06T18:34:31.000Z", "SUCCESS", "CRM X"),
            ]),
          ],
        ]),
        { partialList: true },
      ),
    ).toMatchObject([
      { id: "l3", status: "ok" },
      {
        id: "l1",
        integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
        status: "not-confirmed",
      },
    ]);
  });

  it("numa busca, não deixa a tentativa de leads omitidos do contato confirmar o lead", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.500Z",
      contactUpdatedAt: "2026-10-06T18:34:30.500Z",
    };
    const events = [
      createEvent("2026-10-06T18:14:31.000Z", "ERROR", "CRM X", "Falha"),
      createEvent("2026-10-06T18:17:31.000Z", "SUCCESS", "CRM X"),
      createEvent("2026-10-06T18:34:31.000Z", "SUCCESS", "CRM X"),
    ];
    const histories = new Map([[CONTACT_ID, ready(events)]]);
    const first = createLead("l1", LEAD_CREATED_AT, CONTACT_ID, contact);
    const third = createLead(
      "l3",
      "2026-10-06T18:34:30.500Z",
      CONTACT_ID,
      contact,
    );
    expect(
      classifyLeads([first], histories, { partialList: true })[0],
    ).toMatchObject({
      integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
      status: "not-confirmed",
    });
    expect(
      classifyLeads([third, first], histories, { partialList: true }),
    ).toMatchObject([
      { id: "l3", integrations: [{ status: "ok" }], status: "ok" },
      {
        id: "l1",
        integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
        status: "not-confirmed",
      },
    ]);
  });

  it("separa leads do mesmo contato criados com 2,5 minutos de diferença e não confirma o reenvio que pode ser de qualquer um", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-06T18:17:00.504Z",
    };
    expect(
      classifyLeads(
        [
          createLead(
            "segundo",
            "2026-10-06T18:17:00.500Z",
            CONTACT_ID,
            contact,
          ),
          createLead("primeiro", LEAD_CREATED_AT, CONTACT_ID, contact),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-06T19:06:08.659Z", "SUCCESS", "RD Station"),
              createEvent("2026-10-06T18:17:00.761Z", "SUCCESS", "RD Station"),
              createEvent("2026-10-06T18:17:00.739Z", "INFO", "RD Station"),
              createEvent(
                "2026-10-06T18:14:30.761Z",
                "ERROR",
                "RD Station",
                "Falha",
              ),
              createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
            ]),
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      {
        id: "segundo",
        integrations: [{ name: "RD Station", reason: "", status: "ok" }],
        status: "ok",
      },
      {
        id: "primeiro",
        integrations: [
          { name: "RD Station", reason: LATER_REASON, status: "not-confirmed" },
        ],
        status: "not-confirmed",
      },
    ]);
  });

  it("não confirma as integrações de leads do mesmo contato criados no mesmo instante", () => {
    expect(
      classifyLeads(
        [
          createLead("primeiro", LEAD_CREATED_AT),
          createLead("gemeo", LEAD_CREATED_AT),
        ],
        new Map([
          [
            CONTACT_ID,
            ready([
              createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "RD Station"),
            ]),
          ],
        ]),
        { partialList: false },
      ),
    ).toMatchObject([
      {
        integrations: [
          {
            reason: "outro lead do mesmo contato foi criado no mesmo instante",
            status: "not-confirmed",
          },
        ],
        status: "not-confirmed",
      },
      { integrations: [{ status: "not-confirmed" }], status: "not-confirmed" },
    ]);
  });

  it("não confirma sucesso e falha registrados no mesmo instante", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "RD Station"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station", "Falha"),
      ]),
    ).toMatchObject({
      integrations: [
        {
          message: "",
          reason: "sucesso e falha registrados no mesmo instante",
          status: "not-confirmed",
        },
      ],
      status: "not-confirmed",
    });
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "INFO", "RD Station"),
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "RD Station"),
      ]),
    ).toMatchObject({ integrations: [{ status: "ok" }], status: "ok" });
  });

  it("conta uma vez os eventos com o mesmo identificador", () => {
    const success = createEvent(
      "2026-10-06T18:14:30.761Z",
      "SUCCESS",
      "RD Station",
      "",
      "evento-1",
    );
    expect(
      classifyOne([
        success,
        { ...success, body: "Falha", type: "ERROR" },
        success,
      ]),
    ).toMatchObject({ integrations: [{ status: "ok" }], status: "ok" });
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "RD Station"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station"),
      ]),
    ).toMatchObject({ integrations: [{ status: "not-confirmed" }] });
  });

  it("usa o lead mais novo do contato indicado pelo contato para cortar a tentativa automática", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-06T18:15:00.504Z",
    };
    expect(
      classifyOne(
        [
          createEvent("2026-10-06T18:14:30.739Z", "INFO", "RD Station"),
          createEvent("2026-10-06T18:15:00.739Z", "INFO", "RD Station"),
          createEvent("2026-10-06T18:15:00.761Z", "SUCCESS", "RD Station"),
        ],
        contact,
        true,
      ),
    ).toMatchObject({
      integrations: [
        { name: "RD Station", reason: LATER_REASON, status: "not-confirmed" },
      ],
      status: "not-confirmed",
    });
  });

  it("só confirma tentativas posteriores com evidência de lead único, fora de busca e de lista incompleta", () => {
    const contact = {
      contactCreatedAt: "2026-10-06T18:14:30.503Z",
      contactUpdatedAt: "2026-10-08T16:00:00.004Z",
    };
    const leads = [
      createLead("novo", "2026-10-08T16:00:00.000Z", CONTACT_ID, contact),
      createLead("antigo", LEAD_CREATED_AT, CONTACT_ID, contact),
    ];
    const events = [
      createEvent("2026-10-06T18:14:30.761Z", "ERROR", "RD Station"),
      createEvent("2026-10-06T19:06:08.659Z", "SUCCESS", "RD Station"),
    ];
    const histories = new Map([[CONTACT_ID, ready(events)]]);
    expect(
      classifyLeads(leads, histories, { partialList: false })[1],
    ).toMatchObject({
      integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
      status: "not-confirmed",
    });
    expect(
      classifyLeads(leads, histories, { partialList: true })[1],
    ).toMatchObject({ status: "not-confirmed" });
    expect(classifyOne(events, SINGLE_LEAD_CONTACT, true)).toMatchObject({
      integrations: [{ reason: LATER_REASON, status: "not-confirmed" }],
      status: "not-confirmed",
    });
    expect(classifyOne(events)).toMatchObject({
      integrations: [{ status: "ok" }],
      status: "ok",
    });
  });

  it("resume o lead pelo pior status das integrações", () => {
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "A"),
        createEvent("2026-10-06T18:14:30.761Z", "INFO", "B"),
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "C"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "C"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "D"),
      ])?.status,
    ).toBe("error");
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "A"),
        createEvent("2026-10-06T18:14:30.761Z", "INFO", "B"),
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "C"),
        createEvent("2026-10-06T18:14:30.761Z", "ERROR", "C"),
      ])?.status,
    ).toBe("not-confirmed");
    expect(
      classifyOne([
        createEvent("2026-10-06T18:14:30.761Z", "SUCCESS", "A"),
        createEvent("2026-10-06T18:14:30.761Z", "INFO", "B"),
      ])?.status,
    ).toBe("pending");
  });

  it("conta os leads por status", () => {
    expect(
      countLeadsByStatus([
        createVerifiedLead("error"),
        createVerifiedLead("ok"),
        createVerifiedLead("error"),
        createVerifiedLead("unavailable"),
        createVerifiedLead("not-confirmed"),
      ]),
    ).toEqual({
      error: 2,
      "no-events": 0,
      "not-confirmed": 1,
      ok: 1,
      pending: 0,
      unavailable: 1,
    });
  });

  it("aceita o relatório classificado", () => {
    expect(isLeadIntegrationReport({ leads: [], missingLeads: 0 })).toBe(true);
    expect(
      isLeadIntegrationReport({
        leads: [
          {
            ...createVerifiedLead("error"),
            integrations: [
              {
                message: "Falha",
                name: "RD Station",
                reason: "",
                status: "error",
              },
              {
                message: "",
                name: "Syonet",
                reason: LATER_REASON,
                status: "not-confirmed",
              },
            ],
          },
          createVerifiedLead("no-events"),
          { ...createVerifiedLead("unavailable"), reason: "HTTP 500" },
        ],
        missingLeads: 2,
      }),
    ).toBe(true);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { leads: [] },
    { leads: [], missingLeads: -1 },
    { leads: [], missingLeads: "0" },
    { leads: [], missingLeads: 0.5 },
    { leads: [null], missingLeads: 0 },
    {
      leads: [{ ...createVerifiedLead("ok"), status: "outro" }],
      missingLeads: 0,
    },
    {
      leads: [{ ...createVerifiedLead("ok"), status: "toString" }],
      missingLeads: 0,
    },
    {
      leads: [{ ...createVerifiedLead("ok"), createdAt: "ontem" }],
      missingLeads: 0,
    },
    { leads: [{ ...createVerifiedLead("ok"), email: null }], missingLeads: 0 },
    {
      leads: [{ ...createVerifiedLead("ok"), reason: undefined }],
      missingLeads: 0,
    },
    {
      leads: [{ ...createVerifiedLead("ok"), integrations: [{}] }],
      missingLeads: 0,
    },
    {
      leads: [
        {
          ...createVerifiedLead("ok"),
          integrations: [
            { message: "", name: "RD", reason: "", status: "no-events" },
          ],
        },
      ],
      missingLeads: 0,
    },
    {
      leads: [
        {
          ...createVerifiedLead("ok"),
          integrations: [{ message: "", name: "RD", status: "ok" }],
        },
      ],
      missingLeads: 0,
    },
  ])("rejeita o relatório inválido %j", (report) => {
    expect(isLeadIntegrationReport(report)).toBe(false);
  });
});
