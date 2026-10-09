export type PanelCookie = { name: string; value: string };

export type PanelSessionOptions = {
  accessToken?: string;
  clientId?: string;
  expiresAt: number;
  idToken?: string;
  username?: string;
};

export const PANEL_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
export const PANEL_ACTOR_EMAIL = "usuario.ficticio@example.com";
export const PANEL_CONTACT_IDS = {
  bruna: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  caio: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  dora: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  enzo: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  test: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
export const PANEL_LEADS_URL =
  "https://admin.autodromo.com.br/#/contas/" +
  PANEL_ACCOUNT_ID +
  "/leads?page=1";
export const PANEL_REFRESH_TOKEN = "token-de-renovacao-ficticio";
export const PANEL_TEST_SUBMISSION_ID = "LT-20261008-141748-012";

export const panelConversions = {
  data: [
    createConversion({
      contactId: PANEL_CONTACT_IDS.test,
      createdAt: "2026-10-08T17:17:48.859Z",
      email: "lt-20261008-141748-012@example.com",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Teste LT-20261008-141748-012",
      phone: "11900000001",
    }),
    createConversion({
      contactId: PANEL_CONTACT_IDS.bruna,
      createdAt: "2026-10-08T16:00:00.000Z",
      email: "bruna.exemplo@example.com",
      id: "00000000-0000-4000-8000-000000000002",
      name: "Bruna Exemplo",
      phone: "11900000002",
    }),
    createConversion({
      contactId: PANEL_CONTACT_IDS.caio,
      createdAt: "2026-10-08T15:00:00.000Z",
      email: "caio.ficticio@example.com",
      id: "00000000-0000-4000-8000-000000000003",
      name: "Caio Fictício",
      phone: "11900000003",
    }),
    createConversion({
      contactId: PANEL_CONTACT_IDS.dora,
      createdAt: "2026-10-08T14:00:00.000Z",
      email: "dora.modelo@example.com",
      id: "00000000-0000-4000-8000-000000000004",
      name: "Dora Modelo",
      phone: "11900000004",
    }),
    createConversion({
      contactId: PANEL_CONTACT_IDS.bruna,
      createdAt: "2026-10-06T18:14:30.500Z",
      email: "bruna.exemplo@example.com",
      id: "00000000-0000-4000-8000-000000000005",
      name: "Bruna Exemplo",
      phone: "11900000002",
    }),
    createConversion({
      contactId: PANEL_CONTACT_IDS.enzo,
      createdAt: "2026-10-05T12:00:00.000Z",
      email: "enzo.amostra@example.com",
      id: "00000000-0000-4000-8000-000000000006",
      name: "Enzo Amostra",
      phone: "11900000006",
    }),
  ],
  pagination: { limit: 10, page: 1, total: 6, totalPages: 1 },
};

export const panelHistories: Record<string, { data: object[] }> = {
  [PANEL_CONTACT_IDS.bruna]: createHistory(PANEL_CONTACT_IDS.bruna, [
    ["2026-10-08T16:00:00.900Z", "SUCCESS", "Syonet", "Lead enviado."],
    ["2026-10-08T16:00:00.400Z", "INFO", "Syonet", "Dados recebidos."],
    [
      "2026-10-06T19:06:08.659Z",
      "SUCCESS",
      "Reenvio manual - RD Station",
      "Lead enviado.",
    ],
    [
      "2026-10-06T19:06:08.640Z",
      "INFO",
      "Reenvio manual - RD Station",
      "Dados recebidos.",
    ],
    ["2026-10-06T18:14:31.253Z", "SUCCESS", "My Honda", "Lead enviado."],
    ["2026-10-06T18:14:30.929Z", "INFO", "My Honda", "Dados recebidos."],
    [
      "2026-10-06T18:14:30.761Z",
      "ERROR",
      "RD Station",
      "Parâmetros incompletos",
    ],
    ["2026-10-06T18:14:30.739Z", "INFO", "RD Station", "Dados recebidos."],
    ["2026-10-01T09:00:00.000Z", "ERROR", "Syonet", "Falha antiga"],
  ]),
  [PANEL_CONTACT_IDS.caio]: createHistory(PANEL_CONTACT_IDS.caio, [
    ["2026-10-08T15:00:00.300Z", "INFO", "RD Station", "Dados recebidos."],
  ]),
  [PANEL_CONTACT_IDS.dora]: createHistory(PANEL_CONTACT_IDS.dora, []),
  [PANEL_CONTACT_IDS.test]: createHistory(PANEL_CONTACT_IDS.test, [
    ["2026-10-08T17:17:49.600Z", "SUCCESS", "My Honda", "Lead enviado."],
    ["2026-10-08T17:17:49.300Z", "INFO", "My Honda", "Dados recebidos."],
    [
      "2026-10-08T17:17:49.120Z",
      "ERROR",
      "RD Station",
      "Parâmetros incompletos [ 3f9a1c ]",
    ],
    ["2026-10-08T17:17:49.098Z", "INFO", "RD Station", "Dados recebidos."],
  ]),
};

export const panelReport = {
  leads: [
    {
      createdAt: "2026-10-08T17:17:48.859Z",
      email: "lt-20261008-141748-012@example.com",
      id: "00000000-0000-4000-8000-000000000001",
      integrations: [
        { message: "", name: "My Honda", status: "ok" },
        {
          message: "Parâmetros incompletos [ 3f9a1c ]",
          name: "RD Station",
          status: "error",
        },
      ],
      name: "Teste LT-20261008-141748-012",
      phone: "11900000001",
      status: "error",
    },
    {
      createdAt: "2026-10-08T16:00:00.000Z",
      email: "bruna.exemplo@example.com",
      id: "00000000-0000-4000-8000-000000000002",
      integrations: [{ message: "", name: "Syonet", status: "ok" }],
      name: "Bruna Exemplo",
      phone: "11900000002",
      status: "ok",
    },
    {
      createdAt: "2026-10-08T15:00:00.000Z",
      email: "caio.ficticio@example.com",
      id: "00000000-0000-4000-8000-000000000003",
      integrations: [{ message: "", name: "RD Station", status: "pending" }],
      name: "Caio Fictício",
      phone: "11900000003",
      status: "pending",
    },
    {
      createdAt: "2026-10-08T14:00:00.000Z",
      email: "dora.modelo@example.com",
      id: "00000000-0000-4000-8000-000000000004",
      integrations: [],
      name: "Dora Modelo",
      phone: "11900000004",
      status: "no-events",
    },
    {
      createdAt: "2026-10-06T18:14:30.500Z",
      email: "bruna.exemplo@example.com",
      id: "00000000-0000-4000-8000-000000000005",
      integrations: [
        { message: "", name: "My Honda", status: "ok" },
        { message: "", name: "RD Station", status: "ok" },
      ],
      name: "Bruna Exemplo",
      phone: "11900000002",
      status: "ok",
    },
    {
      createdAt: "2026-10-05T12:00:00.000Z",
      email: "enzo.amostra@example.com",
      id: "00000000-0000-4000-8000-000000000006",
      integrations: [],
      name: "Enzo Amostra",
      phone: "11900000006",
      status: "unavailable",
    },
  ],
};

export function createPanelCookies({
  accessToken,
  clientId = "clienteficticio123",
  expiresAt,
  idToken,
  username = PANEL_ACTOR_EMAIL,
}: PanelSessionOptions): PanelCookie[] {
  const prefix = "CognitoIdentityServiceProvider." + clientId + ".";
  const userPrefix = encodeURIComponent(prefix + username + ".");

  return [
    {
      name: userPrefix + "accessToken",
      value:
        accessToken ??
        createPanelToken({
          client_id: clientId,
          exp: Math.floor(expiresAt / 1000),
          token_use: "access",
          username,
        }),
    },
    { name: userPrefix + "clockDrift", value: "0" },
    {
      name: userPrefix + "idToken",
      value:
        idToken ??
        createPanelToken({
          email: PANEL_ACTOR_EMAIL,
          exp: Math.floor(expiresAt / 1000),
          name: "Usuario Ficticio",
          token_use: "id",
        }),
    },
    { name: prefix + "LastAuthUser", value: username },
    { name: userPrefix + "refreshToken", value: PANEL_REFRESH_TOKEN },
    {
      name: userPrefix + "userData",
      value: encodeURIComponent(JSON.stringify({ Username: username })),
    },
  ];
}

export function createPanelToken(payload: Record<string, unknown>): string {
  return [
    ...[{ alg: "none", typ: "JWT" }, payload].map((part) =>
      Buffer.from(JSON.stringify(part)).toString("base64url"),
    ),
    "assinatura-ficticia",
  ].join(".");
}

export function toCookieHeader(cookies: PanelCookie[]): string {
  return cookies.map(({ name, value }) => name + "=" + value).join("; ");
}

function createConversion(lead: {
  contactId: string;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  phone: string;
}) {
  return {
    ...lead,
    accountId: PANEL_ACCOUNT_ID,
    channel: "Home",
    contact: {
      createdAt: "2026-10-01T08:00:00.000Z",
      id: lead.contactId,
      name: lead.name,
    },
    customParameters: {},
    product: "Página Inicial",
    status: "NEW",
    teamId: null,
  };
}

function createHistory(
  contactId: string,
  events: [createdAt: string, type: string, title: string, body: string][],
) {
  return {
    data: events.map(([createdAt, type, title, body], index) => ({
      body,
      contactId,
      conversionParameters: null,
      createdAt,
      id: "99999999-9999-4999-8999-" + String(index).padStart(12, "0"),
      title,
      type,
    })),
    message: "Integration histories retrieved successfully",
  };
}
