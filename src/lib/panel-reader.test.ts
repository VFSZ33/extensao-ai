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
  toCookieHeader,
} from "@tests/fixtures/panel";
import { describe, expect, it, vi } from "vitest";

import {
  type PanelEnvironment,
  type PanelRequest,
  readPanelLeads,
} from "@/lib/panel-reader";

type FakeResponse = { body?: unknown; status?: number };

type Responder = (url: URL) => FakeResponse | Promise<FakeResponse>;

const API_ORIGIN = "https://crmv3.autodromo.com.br";
const NOW = Date.parse("2026-10-09T12:00:00.000Z");
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
  const readCookies = vi.fn(() => cookieHeader);
  const environment: PanelEnvironment = {
    fetch: async (requestUrl, request) => {
      calls.push({ request, url: requestUrl });
      const { body, status = 200 } = await respond(new URL(requestUrl));

      return { json: async () => body, status };
    },
    now: () => NOW,
    readCookies,
    url,
  };

  return { calls, environment, readCookies };
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

function respondFromFixtures(url: URL): FakeResponse {
  if (url.pathname === "/conversions") {
    return { body: panelConversions };
  }

  const history = panelHistories[url.pathname.split("/")[2] ?? ""];

  return history ? { body: history } : { status: 500 };
}

function respondWithLeads(data: unknown[], history: Responder): Responder {
  return (url) =>
    url.pathname === "/conversions" ? { body: { data } } : history(url);
}

describe("Leitura dos leads no painel", () => {
  it("não lê cookies nem chama a API fora do painel", async () => {
    const { calls, environment, readCookies } = createEnvironment({
      url: "https://example.com/contas/" + PANEL_ACCOUNT_ID + "/leads",
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
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
      await expect(readPanelLeads(environment)).resolves.toEqual({
        error: "Abra a lista de leads de uma conta no painel e tente de novo.",
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
    await expect(readPanelLeads(environment)).resolves.toEqual({
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
    await expect(readPanelLeads(environment)).resolves.toEqual({
      error,
      ok: false,
    });
    expect(calls).toEqual([]);
  });

  it("classifica os leads da conta com uma consulta por contato", async () => {
    const { calls, environment } = createEnvironment();
    await expect(readPanelLeads(environment)).resolves.toEqual({
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
      ].map(
        (contactId) =>
          API_ORIGIN +
          "/contacts/" +
          contactId +
          "/integration-histories?accountId=" +
          PANEL_ACCOUNT_ID,
      ),
    ]);
  });

  it("só faz requisições GET à API do painel, com o token no cabeçalho", async () => {
    const { calls, environment } = createEnvironment();
    await readPanelLeads(environment);
    expect(calls).toHaveLength(6);

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
    const response = await readPanelLeads(environment);
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
        "status",
      ]),
    );
  });

  it("informa a conta sem leads com uma única consulta", async () => {
    const { calls, environment } = createEnvironment({
      respond: () => ({ body: { data: [] } }),
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
      ok: true,
      result: { leads: [] },
    });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [401, "A sessão do painel expirou. Recarregue o painel ou entre de novo."],
    [403, "O seu usuário não tem acesso aos leads desta conta no painel."],
    [500, "A API do painel respondeu com erro (HTTP 500)."],
  ])("informa a resposta %i da lista de leads", async (status, error) => {
    const { calls, environment } = createEnvironment({
      respond: () => ({ body: { message: accessToken }, status }),
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
      error,
      ok: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("informa a falha de rede sem repassar o erro original", async () => {
    const { environment } = createEnvironment({
      respond: () => {
        throw new TypeError("Failed to fetch " + accessToken);
      },
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
      error:
        "Não foi possível consultar a API do painel. Confira a conexão e tente de novo.",
      ok: false,
    });
  });

  it("informa a falha inesperada sem repassar o erro original", async () => {
    const { environment, readCookies } = createEnvironment();
    readCookies.mockImplementation(() => {
      throw new Error(accessToken);
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
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
    await expect(readPanelLeads(environment)).resolves.toEqual({
      error: "A API do painel retornou uma resposta inesperada.",
      ok: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("rejeita a lista de leads que não é JSON", async () => {
    const { environment } = createEnvironment();
    environment.fetch = async () => ({
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
      status: 200,
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
      error: "A API do painel retornou uma resposta inesperada.",
      ok: false,
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
    await expect(readPanelLeads(environment)).resolves.toEqual({
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
            status: "unavailable",
          },
          {
            createdAt: "2026-10-08T16:00:00.000Z",
            email: "",
            id: "00000000-0000-4000-8000-000000000002",
            integrations: [],
            name: "",
            phone: "",
            status: "unavailable",
          },
        ],
      },
    });
    expect(calls).toHaveLength(1);
  });

  it.each<[string, Responder]>([
    ["HTTP 500", () => ({ status: 500 })],
    ["HTTP 403", () => ({ status: 403 })],
    [
      "falha de rede",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
    ["resposta sem lista", () => ({ body: { data: "vazio" } })],
    ["evento sem tipo", () => ({ body: { data: [{ title: "Syonet" }] } })],
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
    ],
  ])(
    "mantém os demais leads quando o histórico de um contato tem %s",
    async (_case, failure) => {
      const { environment } = createEnvironment({
        respond: (url) =>
          url.pathname.includes(PANEL_CONTACT_IDS.caio)
            ? failure(url)
            : respondFromFixtures(url),
      });
      await expect(readPanelLeads(environment)).resolves.toEqual({
        ok: true,
        result: {
          leads: panelReport.leads.map((lead) =>
            lead.name === "Caio Fictício"
              ? { ...lead, integrations: [], status: "unavailable" }
              : lead,
          ),
        },
      });
    },
  );

  it("interrompe a verificação quando um histórico responde 401", async () => {
    const { calls, environment } = createEnvironment({
      respond: respondWithLeads(createManyLeads(10), () => ({ status: 401 })),
    });
    await expect(readPanelLeads(environment)).resolves.toEqual({
      error:
        "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
      ok: false,
    });
    expect(calls.length).toBeLessThanOrEqual(4);
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
    const response = await readPanelLeads(environment);
    expect(
      response.ok && response.result.leads.map(({ name }) => name),
    ).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((index) => "Lead " + index));
    expect(calls).toHaveLength(11);
    expect(peak).toBe(3);
  });
});
