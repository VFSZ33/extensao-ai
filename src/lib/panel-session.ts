import { isRecord } from "@/lib/is-record";

export type PanelSession = {
  accessToken: string;
  actorEmail: string;
};

export type PanelSessionReading =
  | { session: PanelSession; status: "ready" }
  | { status: "expired" | "missing" };

export const PANEL_API_ORIGIN = "https://crmv3.autodromo.com.br";
export const PANEL_ORIGIN = "https://admin.autodromo.com.br";
export const PANEL_REQUIRED_MESSAGE =
  "Abra o painel administrativo na aba ativa para verificar as integrações.";

const ACCOUNT_HASH_PATTERN = /^#\/contas\/([^/?]+)(?:[/?]|$)/;
const ACCOUNT_PATH_PATTERN = /^\/contas\/([^/]+)(?:\/|$)/;
const COOKIE_PREFIX = "CognitoIdentityServiceProvider.";
const HASH_ROUTE_PREFIX = "#/";
const HEADER_VALUE_PATTERN = /^[\x20-\x7e\xa0-\xff]+$/;
const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAST_USER_KEY = "LastAuthUser";
const SESSION_KEYS = ["accessToken", "idToken", LAST_USER_KEY];
const TOKEN_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export function isPanelId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function isPanelUrl(value: string): boolean {
  return parseUrl(value)?.origin === PANEL_ORIGIN;
}

export function readPanelAccountId(value: string): string | undefined {
  const url = parseUrl(value);

  if (url?.origin !== PANEL_ORIGIN) {
    return undefined;
  }

  const accountId = url.hash.startsWith(HASH_ROUTE_PREFIX)
    ? ACCOUNT_HASH_PATTERN.exec(url.hash)?.[1]
    : ACCOUNT_PATH_PATTERN.exec(url.pathname)?.[1];

  return isPanelId(accountId) ? accountId : undefined;
}

export function readPanelSession(
  cookieHeader: string,
  now: number,
): PanelSessionReading {
  const cookies = parseSessionCookies(cookieHeader);
  let expired = false;

  for (const [name, username] of cookies) {
    if (!name.endsWith("." + LAST_USER_KEY)) {
      continue;
    }

    const userKey = name.slice(0, -LAST_USER_KEY.length) + username;
    const accessToken = cookies.get(userKey + ".accessToken") ?? "";
    const expiration = readTokenPayload(accessToken)?.exp;
    const identity = readTokenPayload(cookies.get(userKey + ".idToken") ?? "");

    if (
      typeof expiration !== "number" ||
      !identity ||
      !isHeaderValue(identity.email)
    ) {
      continue;
    }

    if (expiration * 1000 <= now) {
      expired = true;
      continue;
    }

    return {
      session: { accessToken, actorEmail: identity.email },
      status: "ready",
    };
  }

  return { status: expired ? "expired" : "missing" };
}

function decodeCookieText(text: string): string {
  const unquoted =
    text.length > 1 && text.startsWith('"') && text.endsWith('"')
      ? text.slice(1, -1)
      : text;

  try {
    return decodeURIComponent(unquoted);
  } catch {
    return unquoted;
  }
}

function isHeaderValue(value: unknown): value is string {
  return typeof value === "string" && HEADER_VALUE_PATTERN.test(value);
}

function parseSessionCookies(header: string): Map<string, string> {
  const cookies = new Map<string, string>();

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");

    if (separator < 0) {
      continue;
    }

    const name = decodeCookieText(pair.slice(0, separator).trim());

    if (
      name.startsWith(COOKIE_PREFIX) &&
      SESSION_KEYS.some((key) => name.endsWith("." + key)) &&
      !cookies.has(name)
    ) {
      cookies.set(name, decodeCookieText(pair.slice(separator + 1).trim()));
    }
  }

  return cookies;
}

function parseUrl(value: string): undefined | URL {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function readTokenPayload(token: string): Record<string, unknown> | undefined {
  if (!TOKEN_PATTERN.test(token)) {
    return undefined;
  }

  try {
    const binary = atob(
      (token.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/"),
    );
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      ),
    );

    return isRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}
