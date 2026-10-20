import {
  createPanelCookies,
  PANEL_ACCOUNT_ID,
  PANEL_ACTOR_EMAIL,
  PANEL_CONTACT_IDS,
  PANEL_LEADS_URL,
  PANEL_REFRESH_TOKEN,
  panelConversions,
  panelHistories,
  panelReport,
  queryPanelConversions,
  toCookieHeader,
} from "@tests/fixtures/panel";
import { describe, expect, it, vi } from "vitest";

import {
  type PanelEnvironment,
  type PanelRequest,
  readPanelLeads,
} from "@/lib/panel-reader";

type FakeResponse = {
  body?: unknown;
  headers?: Record<string, string>;
  json?: () => Promise<unknown>;
  status?: number;
};

type Responder = (
  url: URL,
  request: PanelRequest,
) => FakeResponse | Promise<FakeResponse>;

const API_ORIGIN = "https://crmv3.autodromo.com.br";
const INCOMPLETE_RESPONSE_MESSAGE =
  "A resposta da API do painel chegou incompleta. Tente de novo.";
const INVALID_JSON_MESSAGE =
  "A API do painel retornou uma resposta que não é JSON.";
const INVALID_RESPONSE_MESSAGE =
  "A API do painel retornou uma resposta inesperada.";
const NETWORK_FAILURE_MESSAGE =
  "Não foi possível consultar a API do painel. Confira a conexão e tente de novo.";
const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const QUERY = { limit: 10, search: "" };
const RATE_LIMIT_MESSAGE =
  "A API do painel recusou por excesso de consultas (HTTP 429). Aguarde um pouco e tente de novo.";
const TIMEOUT_MESSAGE = "A API do painel não respondeu a tempo. Tente de novo.";
const cookies = createPanelCookies({ expiresAt: NOW + 3600000 });
const accessToken =
  cookies.find(({ name }) => name.endsWith(".accessToken"))?.value ?? "";
const idToken =
  cookies.find(({ name }) => name.endsWith(".idToken"))?.value ?? "";

function createEnvironment({
  cookieHeader = toCookieHeader(cookies),
  respond = respondFromFixtures,
  url = PANEL_LEADS_URL,
}: { cookieHeader?: string; respond?: Responder; url?: string } = {}) {
  const calls: { request: PanelRequest; url: string }[] = [];
  const waits: number[] = [];
  const readCookies = vi.fn(() => cookieHeader);
  const environment: PanelEnvironment = {
    fetch: async (requestUrl, request) => {
      calls.push({ request, url: requestUrl });
      const {
        body,
        headers = {},
        json = async () => body,
        status = 200,
      } = await respond(new URL(requestUrl), request);

      return { headers: new Headers(headers), json, status };
    },
    now: () => NOW,
    readCookies,
    url,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
  };

  return { calls, environment, readCookies, waits };
}

function createManyLeads(count: number) {
  return Array.from({ length: count }, (_item, index) => {
    const suffix = String(index).padStart(12, "0");

    return {
      contactId: "cccccccc-cccc-4ccc-8ccc-" + suffix,
      createdAt: new Date(NOW - (count - index) * 60000).toISOString(),
      email: "lead" + index + "@example.com",
      id: "00000000-0000-4000-8000-" + suffix,
      name: "Lead " + index,
      phone: "119000000" + String(index).padStart(2, "0"),
    };
  });
}

function historyUrl(contactId: string): string {
  return (
    API_ORIGIN +
    "/contacts/" +
    contactId +
    "/integration-histories?accountId=" +
    PANEL_ACCOUNT_ID
  );
}

function respondFromFixtures(url: URL): FakeResponse {
  if (url.pathname === "/conversions") {
    return {
      body: queryPanelConversions(panelConversions.data, url.searchParams),
    };
  }

  const history = panelHistories[url.pathname.split("/")[2] ?? ""];

  return history ? { body: history } : { status: 500 };
}

function respondInSequence(path: string, responses: FakeResponse[]): Responder {
  let index = 0;

  return (url) => {
    if (!url.pathname.includes(path)) {
      return respondFromFixtures(url);
    }

    const response = responses[Math.min(index, responses.length - 1)] ?? {};
    index += 1;

    return response;
  };
}

function respondWithLeads(data: unknown[], history: Responder): Responder {
  return (url, request) =>
    url.pathname === "/conversions"
      ? { body: { data } }
      : history(url, request);
}

function withCaioUnavailable(reason: string) {
  return {
    leads: panelReport.leads.map((lead) =>
      lead.name === "Caio Fictício"
        ? { ...lead, integrations: [], reason, status: "unavailable" }
        : lead,
    ),
    missingLeads: 0,
  };
}

describe("Leitura dos leads no painel", () => {
  it("não lê cookies nem chama a API fora do painel", async () => {
    const { calls, environment, readCookies } = createEnvironment({
      url: "https://example.com/contas/" + PANEL_ACCOUNT_ID + "/leads",
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error:
        "Abra o painel administrativo na aba ativa para verificar as integrações.",
      ok: false,
    });
    expect(readCookies).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it.each([
    "https://admin.autodromo.com.br/#/contas",
    "https://admin.autodromo.com.br/#/sugestoes",
    "https://admin.autodromo.com.br/contas",
  ])(
    "pede a lista de leads de uma conta em %s sem ler cookies",
    async (url) => {
      const { calls, environment, readCookies } = createEnvironment({ url });
      await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
        error: "Abra a lista de leads de uma conta no painel e tente de novo.",
        ok: false,
      });
      expect(readCookies).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    },
  );

  it.each([
    undefined,
    null,
    {},
    { limit: 7, search: "" },
    { limit: "10", search: "" },
    { limit: 10 },
    { limit: 10, search: "a".repeat(101) },
    { limit: 10, search: "linha\nquebrada" },
  ])(
    "rejeita a consulta inválida %j sem ler cookies nem chamar a API",
    async (query) => {
      const { calls, environment, readCookies } = createEnvironment();
      await expect(readPanelLeads(environment, query)).resolves.toEqual({
        error:
          "A consulta enviada ao painel é inválida. Feche e abra o popup e tente de novo.",
        ok: false,
      });
      expect(readCookies).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    },
  );

  it("lê a conta do caminho quando o painel não usa a rota no hash", async () => {
    const { calls, environment } = createEnvironment({
      url:
        "https://admin.autodromo.com.br/contas/" + PANEL_ACCOUNT_ID + "/leads",
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: panelReport,
    });
    expect(calls[0]?.url).toBe(
      API_ORIGIN +
        "/conversions?accountId=" +
        PANEL_ACCOUNT_ID +
        "&limit=10&page=1",
    );
  });

  it.each([
    [
      "",
      "Sessão do painel não encontrada. Recarregue o painel ou entre de novo.",
    ],
    [
      toCookieHeader(createPanelCookies({ expiresAt: NOW - 1000 })),
      "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
    ],
  ])("não chama a API sem sessão válida", async (cookieHeader, error) => {
    const { calls, environment } = createEnvironment({ cookieHeader });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error,
      ok: false,
    });
    expect(calls).toEqual([]);
  });

  it("classifica os leads da conta com uma consulta por contato e novas tentativas na falha temporária", async () => {
    const { calls, environment, waits } = createEnvironment();
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: panelReport,
    });
    expect(calls.map(({ url }) => url)).toEqual([
      API_ORIGIN +
        "/conversions?accountId=" +
        PANEL_ACCOUNT_ID +
        "&limit=10&page=1",
      ...[
        PANEL_CONTACT_IDS.test,
        PANEL_CONTACT_IDS.bruna,
        PANEL_CONTACT_IDS.caio,
        PANEL_CONTACT_IDS.dora,
        PANEL_CONTACT_IDS.enzo,
        PANEL_CONTACT_IDS.enzo,
        PANEL_CONTACT_IDS.enzo,
      ].map(historyUrl),
    ]);
    expect(waits).toEqual([500, 1000]);
  });

  it("pede a quantidade escolhida e busca pelo termo na API, codificado", async () => {
    const { calls, environment } = createEnvironment();
    const response = await readPanelLeads(environment, {
      limit: 5,
      search: "  lt-20261008-141748-012  ",
    });
    expect(calls[0]?.url).toBe(
      API_ORIGIN +
        "/conversions?accountId=" +
        PANEL_ACCOUNT_ID +
        "&limit=5&page=1&search=lt-20261008-141748-012",
    );
    expect(response).toEqual({
      ok: true,
      result: { leads: [panelReport.leads[0]], missingLeads: 0 },
    });
    expect(calls).toHaveLength(2);

    const encoded = createEnvironment();
    await readPanelLeads(encoded.environment, {
      limit: 20,
      search: "Bruna & ção=1?",
    });
    expect(encoded.calls[0]?.url).toBe(
      API_ORIGIN +
        "/conversions?accountId=" +
        PANEL_ACCOUNT_ID +
        "&limit=20&page=1&search=Bruna+%26+%C3%A7%C3%A3o%3D1%3F",
    );
    expect(new URL(encoded.calls[0]?.url ?? "").origin).toBe(API_ORIGIN);
  });

  it("só faz requisições GET à API do painel, com o token no cabeçalho", async () => {
    const { calls, environment } = createEnvironment();
    await readPanelLeads(environment, QUERY);
    expect(calls).toHaveLength(8);

    for (const { request, url } of calls) {
      expect(new URL(url).origin).toBe(API_ORIGIN);
      expect(url).not.toContain(accessToken);
      expect(request).toEqual({
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + accessToken,
          "x-actor-email": PANEL_ACTOR_EMAIL,
        },
        method: "GET",
        redirect: "error",
        signal: expect.any(AbortSignal),
      });
    }
  });

  it("devolve só os dados classificados, sem a sessão", async () => {
    const { environment } = createEnvironment();
    const response = await readPanelLeads(environment, QUERY);
    const serialized = JSON.stringify(response);

    for (const secret of [
      accessToken,
      idToken,
      PANEL_REFRESH_TOKEN,
      PANEL_ACTOR_EMAIL,
      "Bearer",
      ...accessToken.split("."),
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(response).toMatchObject({ ok: true });
    expect(response.ok && Object.keys(response.result)).toEqual([
      "leads",
      "missingLeads",
    ]);
    expect(
      response.ok && response.result.leads.map((lead) => Object.keys(lead)),
    ).toEqual(
      panelReport.leads.map(() => [
        "createdAt",
        "email",
        "id",
        "integrations",
        "name",
        "phone",
        "reason",
        "status",
      ]),
    );
  });

  it("não devolve a sessão nas falhas", async () => {
    const responders: Responder[] = [
      () => ({ body: { message: accessToken }, status: 401 }),
      () => ({ body: { message: accessToken }, status: 403 }),
      () => ({ body: { message: accessToken }, status: 500 }),
      () => {
        throw new TypeError("Failed to fetch " + accessToken);
      },
      () => ({
        json: async () => {
          throw new SyntaxError("Unexpected token " + accessToken);
        },
      }),
      (url) =>
        url.pathname.includes(PANEL_CONTACT_IDS.caio)
          ? { body: { message: accessToken }, status: 502 }
          : respondFromFixtures(url),
    ];

    for (const respond of responders) {
      const { environment } = createEnvironment({ respond });
      const serialized = JSON.stringify(
        await readPanelLeads(environment, QUERY),
      );

      for (const secret of [
        accessToken,
        idToken,
        PANEL_ACTOR_EMAIL,
        "Bearer",
      ]) {
        expect(serialized).not.toContain(secret);
      }
    }
  });

  it("informa a conta sem leads com uma única consulta", async () => {
    const { calls, environment } = createEnvironment({
      respond: () => ({ body: { data: [] } }),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: { leads: [], missingLeads: 0 },
    });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [
      401,
      "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      1,
    ],
    [403, "O seu usuário não tem acesso aos leads desta conta no painel.", 1],
    [404, "A API do painel respondeu com erro (HTTP 404).", 1],
    [429, RATE_LIMIT_MESSAGE, 3],
    [500, "A API do painel respondeu com erro (HTTP 500).", 3],
    [503, "A API do painel respondeu com erro (HTTP 503).", 3],
  ])(
    "informa a resposta %i da lista de leads",
    async (status, error, attempts) => {
      const { calls, environment } = createEnvironment({
        respond: () => ({ body: { message: accessToken }, status }),
      });
      await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
        error,
        ok: false,
      });
      expect(calls).toHaveLength(attempts);
    },
  );

  it("informa a falha de rede sem repassar o erro original, depois de tentar de novo", async () => {
    const { calls, environment, waits } = createEnvironment({
      respond: () => {
        throw new TypeError("Failed to fetch " + accessToken);
      },
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error: NETWORK_FAILURE_MESSAGE,
      ok: false,
    });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([500, 1000]);
  });

  it("informa o tempo limite sem tentar de novo", async () => {
    const { calls, environment, waits } = createEnvironment({
      respond: () => {
        throw new DOMException("signal timed out", "TimeoutError");
      },
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error: TIMEOUT_MESSAGE,
      ok: false,
    });
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("segue depois de uma falha temporária que se resolve na nova tentativa", async () => {
    const { calls, environment, waits } = createEnvironment({
      respond: respondInSequence("/conversions", [
        { status: 503 },
        {
          json: async () => {
            throw new TypeError("network error");
          },
        },
        { body: panelConversions },
      ]),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toMatchObject({
      ok: true,
      result: { leads: { length: 6 } },
    });
    expect(
      calls.filter(({ url }) => url.includes("/conversions")),
    ).toHaveLength(3);
    expect(waits.slice(0, 2)).toEqual([500, 1000]);
  });

  it.each([
    ["em segundos", "2", 2000],
    ["como data", new Date(NOW + 3000).toUTCString(), 3000],
    ["menor que a espera", "0", 500],
  ])(
    "respeita o Retry-After %s dentro do limite",
    async (_case, retryAfter, wait) => {
      const { environment, waits } = createEnvironment({
        respond: respondInSequence("/conversions", [
          { headers: { "Retry-After": retryAfter }, status: 429 },
          { body: panelConversions },
        ]),
      });
      await expect(readPanelLeads(environment, QUERY)).resolves.toMatchObject({
        ok: true,
      });
      expect(waits[0]).toBe(wait);
    },
  );

  it("não tenta de novo quando o Retry-After passa do limite", async () => {
    const { calls, environment, waits } = createEnvironment({
      respond: (url) =>
        url.pathname.includes(PANEL_CONTACT_IDS.caio)
          ? { headers: { "Retry-After": "30" }, status: 429 }
          : respondFromFixtures(url),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: withCaioUnavailable(RATE_LIMIT_MESSAGE),
    });
    expect(
      calls.filter(({ url }) => url.includes(PANEL_CONTACT_IDS.caio)),
    ).toHaveLength(1);
    expect(waits).toEqual([500, 1000]);
  });

  it("informa a falha inesperada sem repassar o erro original", async () => {
    const { environment, readCookies } = createEnvironment();
    readCookies.mockImplementation(() => {
      throw new Error(accessToken);
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error: "Não foi possível verificar as integrações.",
      ok: false,
    });
  });

  it.each([
    undefined,
    null,
    "texto",
    [],
    {},
    { data: {} },
    { data: [null] },
    { data: [{ ...panelConversions.data[0], id: 7 }] },
    { data: [{ ...panelConversions.data[0], createdAt: "ontem" }] },
    { data: [{ ...panelConversions.data[0], createdAt: undefined }] },
    {
      data: [
        {
          ...panelConversions.data[0],
          accountId: "22222222-2222-4222-8222-222222222222",
        },
      ],
    },
  ])("rejeita a lista de leads inválida %j", async (body) => {
    const { calls, environment } = createEnvironment({
      respond: () => ({ body }),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error: INVALID_RESPONSE_MESSAGE,
      ok: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("rejeita a lista de leads que não é JSON", async () => {
    const { calls, environment } = createEnvironment({
      respond: () => ({
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error: INVALID_JSON_MESSAGE,
      ok: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("informa a resposta que chegou incompleta", async () => {
    const { calls, environment } = createEnvironment({
      respond: () => ({
        json: async () => {
          throw new TypeError("network error");
        },
      }),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error: INCOMPLETE_RESPONSE_MESSAGE,
      ok: false,
    });
    expect(calls).toHaveLength(3);
  });

  it("informa quando a API devolve menos leads do que diz ter", async () => {
    const { environment } = createEnvironment({
      respond: (url) =>
        url.pathname === "/conversions"
          ? {
              body: {
                ...panelConversions,
                pagination: { limit: 10, page: 1, total: 8, totalPages: 1 },
              },
            }
          : respondFromFixtures(url),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: { ...panelReport, missingLeads: 2 },
    });

    const limited = createEnvironment({
      respond: (url) =>
        url.pathname === "/conversions"
          ? {
              body: {
                ...panelConversions,
                pagination: { limit: 5, page: 1, total: 57, totalPages: 12 },
              },
            }
          : respondFromFixtures(url),
    });
    await expect(
      readPanelLeads(limited.environment, { limit: 5, search: "" }),
    ).resolves.toMatchObject({
      ok: true,
      result: { leads: { length: 5 }, missingLeads: 0 },
    });
  });

  it("conta uma vez o lead repetido na resposta", async () => {
    const { environment } = createEnvironment({
      respond: (url) =>
        url.pathname === "/conversions"
          ? {
              body: {
                data: [panelConversions.data[0], panelConversions.data[0]],
              },
            }
          : respondFromFixtures(url),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: { leads: [panelReport.leads[0]], missingLeads: 0 },
    });
  });

  it("só confirma o reenvio com evidência de lead único, sem busca, com a lista completa e com o contato que confere", async () => {
    const lead = panelConversions.data[0];
    const history = {
      data: [
        {
          body: "Falha",
          contactId: PANEL_CONTACT_IDS.test,
          createdAt: "2026-10-08T17:17:49.120Z",
          id: "evento-1",
          title: "RD Station",
          type: "ERROR",
        },
        {
          body: "",
          contactId: PANEL_CONTACT_IDS.test,
          createdAt: "2026-10-08T18:20:00.000Z",
          id: "evento-2",
          title: "Reenvio manual - RD Station",
          type: "SUCCESS",
        },
      ],
    };
    const readStatus = async (
      conversion: unknown,
      query = QUERY,
      total = 1,
    ) => {
      const { environment } = createEnvironment({
        respond: (url) =>
          url.pathname === "/conversions"
            ? {
                body: {
                  data: [conversion],
                  pagination: {
                    limit: query.limit,
                    page: 1,
                    total,
                    totalPages: 1,
                  },
                },
              }
            : { body: history },
      });
      const response = await readPanelLeads(environment, query);

      return response.ok ? response.result.leads[0]?.status : undefined;
    };
    expect(await readStatus(lead)).toBe("ok");
    expect(
      await readStatus({
        ...lead,
        contact: { ...lead?.contact, id: PANEL_CONTACT_IDS.dora },
      }),
    ).toBe("not-confirmed");
    expect(await readStatus(lead, QUERY, 2)).toBe("not-confirmed");
    expect(await readStatus(lead, { limit: 10, search: "teste" })).toBe(
      "not-confirmed",
    );
  });

  it("não deixa a tentativa de um lead que faltou na lista confirmar outro lead do contato", async () => {
    const contact = {
      createdAt: "2026-10-06T18:14:30.500Z",
      id: PANEL_CONTACT_IDS.test,
      name: "Lead",
      updatedAt: "2026-10-06T18:34:30.500Z",
    };
    const createConversion = (id: string, createdAt: string) => ({
      ...panelConversions.data[0],
      contact,
      contactId: PANEL_CONTACT_IDS.test,
      createdAt,
      id,
    });
    const event = (createdAt: string, type: string, id: string) => ({
      body: "",
      contactId: PANEL_CONTACT_IDS.test,
      createdAt,
      id,
      title: "CRM X",
      type,
    });
    const { environment } = createEnvironment({
      respond: (url) =>
        url.pathname === "/conversions"
          ? {
              body: {
                data: [
                  createConversion(
                    "00000000-0000-4000-8000-000000000013",
                    "2026-10-06T18:34:30.500Z",
                  ),
                  createConversion(
                    "00000000-0000-4000-8000-000000000011",
                    "2026-10-06T18:14:30.500Z",
                  ),
                ],
                pagination: { limit: 10, page: 1, total: 3, totalPages: 1 },
              },
            }
          : {
              body: {
                data: [
                  event("2026-10-06T18:34:31.000Z", "SUCCESS", "evento-3"),
                  event("2026-10-06T18:17:31.000Z", "SUCCESS", "evento-2"),
                  event("2026-10-06T18:14:31.000Z", "ERROR", "evento-1"),
                ],
              },
            },
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toMatchObject({
      ok: true,
      result: {
        leads: [
          { status: "ok" },
          {
            integrations: [{ name: "CRM X", status: "not-confirmed" }],
            status: "not-confirmed",
          },
        ],
        missingLeads: 1,
      },
    });
  });

  it("aceita o lead sem nome, e-mail ou telefone e não consulta sem contato", async () => {
    const { calls, environment } = createEnvironment({
      respond: respondWithLeads(
        [
          {
            contactId: "../../conversions",
            createdAt: "2026-10-08T17:17:48.859Z",
            email: null,
            id: "00000000-0000-4000-8000-000000000001",
            name: 7,
          },
          {
            createdAt: "2026-10-08T16:00:00.000Z",
            id: "00000000-0000-4000-8000-000000000002",
          },
        ],
        () => ({ body: { data: [] } }),
      ),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: {
        leads: [
          {
            createdAt: "2026-10-08T17:17:48.859Z",
            email: "",
            id: "00000000-0000-4000-8000-000000000001",
            integrations: [],
            name: "",
            phone: "",
            reason: "A API não informou o contato deste lead.",
            status: "unavailable",
          },
          {
            createdAt: "2026-10-08T16:00:00.000Z",
            email: "",
            id: "00000000-0000-4000-8000-000000000002",
            integrations: [],
            name: "",
            phone: "",
            reason: "A API não informou o contato deste lead.",
            status: "unavailable",
          },
        ],
        missingLeads: 0,
      },
    });
    expect(calls).toHaveLength(1);
  });

  it.each<[string, Responder, string]>([
    [
      "HTTP 500",
      () => ({ status: 500 }),
      "A API do painel respondeu com erro (HTTP 500).",
    ],
    ["HTTP 429", () => ({ status: 429 }), RATE_LIMIT_MESSAGE],
    [
      "falha de rede",
      () => {
        throw new TypeError("Failed to fetch");
      },
      NETWORK_FAILURE_MESSAGE,
    ],
    [
      "tempo limite",
      () => {
        throw new DOMException("signal timed out", "TimeoutError");
      },
      TIMEOUT_MESSAGE,
    ],
    [
      "resposta que não é JSON",
      () => ({
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
      INVALID_JSON_MESSAGE,
    ],
    [
      "resposta interrompida",
      () => ({
        json: async () => {
          throw new TypeError("network error");
        },
      }),
      INCOMPLETE_RESPONSE_MESSAGE,
    ],
    [
      "resposta sem lista",
      () => ({ body: { data: "vazio" } }),
      INVALID_RESPONSE_MESSAGE,
    ],
    [
      "evento sem tipo",
      () => ({ body: { data: [{ title: "Syonet" }] } }),
      INVALID_RESPONSE_MESSAGE,
    ],
    [
      "evento de outro contato",
      () => ({
        body: {
          data: [
            {
              contactId: PANEL_CONTACT_IDS.dora,
              createdAt: "2026-10-08T15:00:00.300Z",
              title: "Syonet",
              type: "SUCCESS",
            },
          ],
        },
      }),
      INVALID_RESPONSE_MESSAGE,
    ],
    [
      "histórico paginado",
      () => ({
        body: {
          data: [],
          pagination: { limit: 20, page: 1, total: 45, totalPages: 3 },
        },
      }),
      "A API devolveu só parte do histórico de integrações deste contato.",
    ],
  ])(
    "mantém os demais leads quando o histórico de um contato tem %s, com o motivo",
    async (_case, failure, reason) => {
      const { environment } = createEnvironment({
        respond: (url, request) =>
          url.pathname.includes(PANEL_CONTACT_IDS.caio)
            ? failure(url, request)
            : respondFromFixtures(url),
      });
      await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
        ok: true,
        result: withCaioUnavailable(reason),
      });
    },
  );

  it("aceita o histórico com paginação completa", async () => {
    const { environment } = createEnvironment({
      respond: (url) =>
        url.pathname.includes(PANEL_CONTACT_IDS.caio)
          ? {
              body: {
                ...panelHistories[PANEL_CONTACT_IDS.caio],
                pagination: { limit: 20, page: 1, total: 1, totalPages: 1 },
              },
            }
          : respondFromFixtures(url),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      ok: true,
      result: panelReport,
    });
  });

  it.each([
    [401, "A sessão do painel expirou. Recarregue o painel ou entre de novo."],
    [403, "O seu usuário não tem acesso aos leads desta conta no painel."],
  ])(
    "interrompe a verificação quando um histórico responde %i",
    async (status, error) => {
      const { calls, environment } = createEnvironment({
        respond: respondWithLeads(createManyLeads(10), () => ({ status })),
      });
      await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
        error,
        ok: false,
      });
      expect(calls.length).toBeLessThanOrEqual(4);
    },
  );

  it("cancela as consultas em andamento quando a verificação é interrompida", async () => {
    const signals: AbortSignal[] = [];
    const { calls, environment } = createEnvironment({
      respond: respondWithLeads(createManyLeads(3), (url, request) => {
        if (url.pathname.endsWith("000000000000/integration-histories")) {
          return { status: 401 };
        }

        signals.push(request.signal);

        return new Promise<FakeResponse>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            reject(request.signal.reason);
          });
        });
      }),
    });
    await expect(readPanelLeads(environment, QUERY)).resolves.toEqual({
      error:
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      ok: false,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(signals).toHaveLength(2);
    expect(signals.every(({ aborted }) => aborted)).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it("verifica os 10 leads mais recentes, com até 3 consultas simultâneas", async () => {
    let running = 0;
    let peak = 0;
    const { calls, environment } = createEnvironment({
      respond: respondWithLeads(createManyLeads(12), async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        running -= 1;

        return { body: { data: [] } };
      }),
    });
    const response = await readPanelLeads(environment, QUERY);
    expect(
      response.ok && response.result.leads.map(({ name }) => name),
    ).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((index) => "Lead " + index));
    expect(calls).toHaveLength(11);
    expect(peak).toBe(3);
  });

  it.each([5, 20])("verifica no máximo %i leads", async (limit) => {
    const { calls, environment } = createEnvironment({
      respond: respondWithLeads(createManyLeads(25), () => ({
        body: { data: [] },
      })),
    });
    const response = await readPanelLeads(environment, { limit, search: "" });
    expect(response.ok && response.result.leads).toHaveLength(limit);
    expect(calls[0]?.url).toContain("&limit=" + limit + "&");
    expect(calls).toHaveLength(limit + 1);
  });
});
