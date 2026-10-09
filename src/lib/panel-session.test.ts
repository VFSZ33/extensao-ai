import {
  createPanelCookies,
  createPanelToken,
  PANEL_ACCOUNT_ID,
  PANEL_ACTOR_EMAIL,
  PANEL_LEADS_URL,
  toCookieHeader,
} from "@tests/fixtures/panel";
import { describe, expect, it } from "vitest";

import {
  isPanelId,
  isPanelUrl,
  readPanelAccountId,
  readPanelSession,
} from "@/lib/panel-session";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const EXPIRES_AT = NOW + 3600000;
const OTHER_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function readSession(options: Parameters<typeof createPanelCookies>[0]) {
  return readPanelSession(toCookieHeader(createPanelCookies(options)), NOW);
}

describe("Sessão do painel", () => {
  it.each([
    "https://admin.autodromo.com.br/",
    "https://admin.autodromo.com.br/contas/" + PANEL_ACCOUNT_ID + "/leads",
    "https://admin.autodromo.com.br:443/login?next=%2Fcontas",
  ])("reconhece %s como o painel", (url) => {
    expect(isPanelUrl(url)).toBe(true);
  });

  it.each([
    "",
    "admin.autodromo.com.br",
    "http://admin.autodromo.com.br/",
    "https://admin.autodromo.com.br:8443/",
    "https://admin.autodromo.com.br.example.com/",
    "https://admin.autodromo.com.br@example.com/",
    "https://autodromo.com.br/",
    "https://crmv3.autodromo.com.br/",
    "https://example.com/?url=https://admin.autodromo.com.br/",
    "https://outro.admin.autodromo.com.br/",
    "chrome-extension://admin.autodromo.com.br/popup.html",
  ])("não reconhece %j como o painel", (url) => {
    expect(isPanelUrl(url)).toBe(false);
    expect(readPanelAccountId(url)).toBeUndefined();
  });

  it.each([
    [
      "https://admin.autodromo.com.br/#/contas/0a3a8770-0f07-4c14-9e56-79b2b53cd560/leads?page=1",
      "0a3a8770-0f07-4c14-9e56-79b2b53cd560",
    ],
    [PANEL_LEADS_URL, PANEL_ACCOUNT_ID],
    [
      "https://admin.autodromo.com.br/#/contas/" + PANEL_ACCOUNT_ID,
      PANEL_ACCOUNT_ID,
    ],
    [
      "https://admin.autodromo.com.br/#/contas/" + PANEL_ACCOUNT_ID + "/",
      PANEL_ACCOUNT_ID,
    ],
    [
      "https://admin.autodromo.com.br/#/contas/" + PANEL_ACCOUNT_ID + "?page=1",
      PANEL_ACCOUNT_ID,
    ],
    [
      "https://admin.autodromo.com.br/contas/" +
        OTHER_ACCOUNT_ID +
        "/leads#/contas/" +
        PANEL_ACCOUNT_ID +
        "/leads",
      PANEL_ACCOUNT_ID,
    ],
    [
      "https://admin.autodromo.com.br/contas/" +
        PANEL_ACCOUNT_ID +
        "/leads#topo",
      PANEL_ACCOUNT_ID,
    ],
  ])("lê a conta da rota de %s", (url, accountId) => {
    expect(isPanelUrl(url)).toBe(true);
    expect(readPanelAccountId(url)).toBe(accountId);
  });

  it.each([
    "https://admin.autodromo.com.br/#/",
    "https://admin.autodromo.com.br/#/contas",
    "https://admin.autodromo.com.br/#/contas/",
    "https://admin.autodromo.com.br/#/contas?page=1",
    "https://admin.autodromo.com.br/#/sugestoes",
    "https://admin.autodromo.com.br/#/contas/nova/leads",
    "https://admin.autodromo.com.br/#/contas/0a3a8770-0f07-4c14-9e56/leads?page=1",
    "https://admin.autodromo.com.br/#/contas/" + PANEL_ACCOUNT_ID + "x/leads",
    "https://admin.autodromo.com.br/#/contas/..%2Fconversions/leads",
    "https://admin.autodromo.com.br/#/leads/" + PANEL_ACCOUNT_ID,
    "https://admin.autodromo.com.br/#/sugestoes?conta=" + PANEL_ACCOUNT_ID,
    "https://admin.autodromo.com.br/#contas/" + PANEL_ACCOUNT_ID,
    "https://admin.autodromo.com.br/contas/" +
      PANEL_ACCOUNT_ID +
      "/leads#/sugestoes",
  ])("não encontra conta na rota de %s", (url) => {
    expect(isPanelUrl(url)).toBe(true);
    expect(readPanelAccountId(url)).toBeUndefined();
  });

  it.each([
    "http://admin.autodromo.com.br/#/contas/" + PANEL_ACCOUNT_ID + "/leads",
    "https://admin.autodromo.com.br.example.com/#/contas/" +
      PANEL_ACCOUNT_ID +
      "/leads?page=1",
    "https://example.com/#/contas/" + PANEL_ACCOUNT_ID + "/leads?page=1",
  ])("não lê a conta do hash de %s, fora do painel", (url) => {
    expect(isPanelUrl(url)).toBe(false);
    expect(readPanelAccountId(url)).toBeUndefined();
  });

  it("lê a conta do caminho da lista de leads", () => {
    expect(
      readPanelAccountId(
        "https://admin.autodromo.com.br/contas/" + PANEL_ACCOUNT_ID + "/leads",
      ),
    ).toBe(PANEL_ACCOUNT_ID);
    expect(
      readPanelAccountId(
        "https://admin.autodromo.com.br/contas/" + PANEL_ACCOUNT_ID,
      ),
    ).toBe(PANEL_ACCOUNT_ID);
  });

  it.each([
    "https://admin.autodromo.com.br/",
    "https://admin.autodromo.com.br/contas",
    "https://admin.autodromo.com.br/contas/nova/leads",
    "https://admin.autodromo.com.br/contas/..%2Fconversions/leads",
    "https://admin.autodromo.com.br/leads/" + PANEL_ACCOUNT_ID,
    "https://admin.autodromo.com.br/?conta=" + PANEL_ACCOUNT_ID,
  ])("não encontra conta em %s", (url) => {
    expect(readPanelAccountId(url)).toBeUndefined();
  });

  it("aceita só identificadores no formato do painel", () => {
    expect(isPanelId(PANEL_ACCOUNT_ID)).toBe(true);
    expect(isPanelId(PANEL_ACCOUNT_ID.toUpperCase())).toBe(true);
    expect(isPanelId("..")).toBe(false);
    expect(isPanelId(PANEL_ACCOUNT_ID + "/resend")).toBe(false);
    expect(isPanelId(undefined)).toBe(false);
  });

  it("lê o token de acesso e o usuário dos cookies do Amplify", () => {
    const cookies = createPanelCookies({ expiresAt: EXPIRES_AT });
    expect(readPanelSession(toCookieHeader(cookies), NOW)).toEqual({
      session: {
        accessToken: cookies.find(({ name }) => name.endsWith(".accessToken"))
          ?.value,
        actorEmail: PANEL_ACTOR_EMAIL,
      },
      status: "ready",
    });
  });

  it("ignora os cookies que não são da sessão e aceita valor entre aspas", () => {
    const cookies = createPanelCookies({ expiresAt: EXPIRES_AT });
    expect(
      readPanelSession(
        toCookieHeader([
          { name: "_ga", value: "GA1.1.0000000000.0000000000" },
          { name: "invalido", value: "%E0%A4%A" },
          ...cookies.map(({ name, value }) => ({
            name,
            value: name.endsWith(".LastAuthUser") ? '"' + value + '"' : value,
          })),
        ]) + "; sem-valor",
        NOW,
      ),
    ).toMatchObject({
      session: { actorEmail: PANEL_ACTOR_EMAIL },
      status: "ready",
    });
  });

  it("usa a sessão do usuário indicado em LastAuthUser", () => {
    const other = createPanelCookies({
      expiresAt: EXPIRES_AT,
      idToken: createPanelToken({ email: "outra.pessoa@example.com" }),
      username: "outra.pessoa@example.com",
    }).filter(({ name }) => !name.endsWith(".LastAuthUser"));
    expect(
      readPanelSession(
        toCookieHeader([
          ...other,
          ...createPanelCookies({ expiresAt: EXPIRES_AT }),
        ]),
        NOW,
      ),
    ).toMatchObject({
      session: { actorEmail: PANEL_ACTOR_EMAIL },
      status: "ready",
    });
  });

  it("informa a sessão expirada pelo exp do token de acesso", () => {
    expect(readSession({ expiresAt: NOW })).toEqual({ status: "expired" });
    expect(readSession({ expiresAt: NOW - 60000 })).toEqual({
      status: "expired",
    });
  });

  it.each([
    ["sem cookies", ""],
    [
      "sem LastAuthUser",
      toCookieHeader(
        createPanelCookies({ expiresAt: EXPIRES_AT }).filter(
          ({ name }) => !name.endsWith(".LastAuthUser"),
        ),
      ),
    ],
    [
      "sem token de acesso",
      toCookieHeader(
        createPanelCookies({ expiresAt: EXPIRES_AT }).filter(
          ({ name }) => !name.endsWith(".accessToken"),
        ),
      ),
    ],
    [
      "sem token de identidade",
      toCookieHeader(
        createPanelCookies({ expiresAt: EXPIRES_AT }).filter(
          ({ name }) => !name.endsWith(".idToken"),
        ),
      ),
    ],
    [
      "com token de acesso fora do formato",
      toCookieHeader(
        createPanelCookies({ accessToken: "abc def", expiresAt: EXPIRES_AT }),
      ),
    ],
    [
      "com token de acesso ilegível",
      toCookieHeader(
        createPanelCookies({ accessToken: "a.b.c", expiresAt: EXPIRES_AT }),
      ),
    ],
    [
      "com token de acesso sem exp",
      toCookieHeader(
        createPanelCookies({
          accessToken: createPanelToken({ token_use: "access" }),
          expiresAt: EXPIRES_AT,
        }),
      ),
    ],
    [
      "com token de identidade sem e-mail",
      toCookieHeader(
        createPanelCookies({
          expiresAt: EXPIRES_AT,
          idToken: createPanelToken({ token_use: "id" }),
        }),
      ),
    ],
    [
      "com e-mail que não cabe em um cabeçalho",
      toCookieHeader(
        createPanelCookies({
          expiresAt: EXPIRES_AT,
          idToken: createPanelToken({ email: "a@example.com\r\nx: 1" }),
        }),
      ),
    ],
  ])("não encontra sessão %s", (_case, cookieHeader) => {
    expect(readPanelSession(cookieHeader, NOW)).toEqual({ status: "missing" });
  });
});
