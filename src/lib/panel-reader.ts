import type { PageResponse } from "@/lib/page-command";

import {
  classifyLeads,
  type HistoryReading,
  type IntegrationEvent,
  type LeadIntegrationReport,
  type PanelLead,
} from "@/lib/integration-status";
import { isRecord } from "@/lib/is-record";
import { parsePanelQuery } from "@/lib/panel-query";
import {
  isPanelId,
  isPanelUrl,
  PANEL_API_ORIGIN,
  PANEL_REQUIRED_MESSAGE,
  type PanelSession,
  readPanelAccountId,
  readPanelSession,
} from "@/lib/panel-session";

export type PanelEnvironment = {
  fetch: (url: string, request: PanelRequest) => Promise<PanelResponse>;
  now: () => number;
  readCookies: () => string;
  url: string;
  wait: (milliseconds: number) => Promise<void>;
};

export type PanelRequest = {
  cache: "no-store";
  credentials: "omit";
  headers: Record<string, string>;
  method: "GET";
  redirect: "error";
  signal: AbortSignal;
};

export type PanelResponse = {
  headers: { get: (name: string) => null | string };
  json: () => Promise<unknown>;
  status: number;
};

type PanelAccess = {
  accountId: string;
  environment: PanelEnvironment;
  session: PanelSession;
  signal: AbortSignal;
};

type RequestOutcome =
  | { data: unknown; ok: true }
  | { error: PanelError; ok: false; retryable: boolean; retryAfter?: number };

class PanelError extends Error {
  fatal: boolean;

  constructor(message: string, fatal = false) {
    super(message);
    this.fatal = fatal;
  }
}

const EXPIRED_SESSION_MESSAGE =
  "A sessão do painel expirou. Recarregue o painel ou entre de novo.";
const FORBIDDEN_MESSAGE =
  "O seu usuário não tem acesso aos leads desta conta no painel.";
const HISTORY_CONCURRENCY = 3;
const INCOMPLETE_HISTORY_MESSAGE =
  "A API devolveu só parte do histórico de integrações deste contato.";
const INCOMPLETE_RESPONSE_MESSAGE =
  "A resposta da API do painel chegou incompleta. Tente de novo.";
const INVALID_JSON_MESSAGE =
  "A API do painel retornou uma resposta que não é JSON.";
const INVALID_RESPONSE_MESSAGE =
  "A API do painel retornou uma resposta inesperada.";
const NETWORK_FAILURE_MESSAGE =
  "Não foi possível consultar a API do painel. Confira a conexão e tente de novo.";
const RATE_LIMIT_MESSAGE =
  "A API do painel recusou por excesso de consultas (HTTP 429). Aguarde um pouco e tente de novo.";
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_AFTER_LIMIT_MS = 5000;
const RETRY_AFTER_SECONDS_PATTERN = /^\d+$/;
const RETRY_DELAYS_MS = [500, 1000];
const TIMEOUT_MESSAGE = "A API do painel não respondeu a tempo. Tente de novo.";
const UNKNOWN_FAILURE_MESSAGE = "Não foi possível verificar as integrações.";

export async function readPanelLeads(
  environment: PanelEnvironment,
  query: unknown,
): Promise<PageResponse<LeadIntegrationReport>> {
  const stop = new AbortController();

  try {
    return {
      ok: true,
      result: await buildReport(environment, query, stop.signal),
    };
  } catch (error) {
    return {
      error:
        error instanceof PanelError ? error.message : UNKNOWN_FAILURE_MESSAGE,
      ok: false,
    };
  } finally {
    stop.abort();
  }
}

async function buildReport(
  environment: PanelEnvironment,
  query: unknown,
  signal: AbortSignal,
): Promise<LeadIntegrationReport> {
  if (!isPanelUrl(environment.url)) {
    throw new PanelError(PANEL_REQUIRED_MESSAGE);
  }

  const panelQuery = parsePanelQuery(query);

  if (!panelQuery) {
    throw new PanelError(
      "A consulta enviada ao painel é inválida. Feche e abra o popup e tente de novo.",
    );
  }

  const { limit, search } = panelQuery;
  const accountId = readPanelAccountId(environment.url);

  if (accountId === undefined) {
    throw new PanelError(
      "Abra a lista de leads de uma conta no painel e tente de novo.",
    );
  }

  const reading = readPanelSession(
    environment.readCookies(),
    environment.now(),
  );

  if (reading.status !== "ready") {
    throw new PanelError(
      reading.status === "expired"
        ? EXPIRED_SESSION_MESSAGE
        : "Sessão do painel não encontrada. Recarregue o painel ou entre de novo.",
    );
  }

  const access = { accountId, environment, session: reading.session, signal };
  const { leads, missingLeads } = parseLeads(
    await requestPanelData(access, "/conversions", {
      accountId,
      limit: String(limit),
      page: "1",
      ...(search ? { search } : {}),
    }),
    accountId,
    limit,
  );
  const histories = new Map<string, HistoryReading>();

  await runLimited(
    [...new Set(leads.flatMap(({ contactId }) => contactId ?? []))],
    HISTORY_CONCURRENCY,
    async (contactId) => {
      try {
        histories.set(contactId, {
          events: parseHistory(
            await requestPanelData(
              access,
              "/contacts/" + contactId + "/integration-histories",
              { accountId },
            ),
            contactId,
          ),
          status: "ready",
        });
      } catch (error) {
        if (error instanceof PanelError && error.fatal) {
          throw error;
        }

        histories.set(contactId, {
          reason:
            error instanceof PanelError
              ? error.message
              : UNKNOWN_FAILURE_MESSAGE,
          status: "unavailable",
        });
      }
    },
  );

  return {
    leads: classifyLeads(leads, histories, {
      partialList: search !== "" || missingLeads > 0,
    }),
    missingLeads,
  };
}

function describeStatus(response: PanelResponse, now: number): RequestOutcome {
  if (response.status === 401) {
    return {
      error: new PanelError(EXPIRED_SESSION_MESSAGE, true),
      ok: false,
      retryable: false,
    };
  }

  if (response.status === 403) {
    return {
      error: new PanelError(FORBIDDEN_MESSAGE, true),
      ok: false,
      retryable: false,
    };
  }

  const retryable = response.status === 429 || response.status >= 500;

  return {
    error: new PanelError(
      response.status === 429
        ? RATE_LIMIT_MESSAGE
        : "A API do painel respondeu com erro (HTTP " + response.status + ").",
    ),
    ok: false,
    retryable,
    retryAfter: retryable
      ? readRetryAfter(response.headers.get("retry-after"), now)
      : undefined,
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isDateText(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSameId(value: unknown, expected: string): boolean {
  return (
    typeof value !== "string" || value.toLowerCase() === expected.toLowerCase()
  );
}

function isTruncated(pagination: unknown, received: number): boolean {
  return (
    isRecord(pagination) &&
    ((isCount(pagination.total) && pagination.total > received) ||
      (isCount(pagination.totalPages) && pagination.totalPages > 1))
  );
}

function parseHistory(payload: unknown, contactId: string): IntegrationEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new PanelError(INVALID_RESPONSE_MESSAGE);
  }

  if (isTruncated(payload.pagination, payload.data.length)) {
    throw new PanelError(INCOMPLETE_HISTORY_MESSAGE);
  }

  return payload.data.map((item: unknown): IntegrationEvent => {
    if (
      !isRecord(item) ||
      !isDateText(item.createdAt) ||
      !isSameId(item.contactId, contactId) ||
      typeof item.title !== "string" ||
      typeof item.type !== "string"
    ) {
      throw new PanelError(INVALID_RESPONSE_MESSAGE);
    }

    return {
      body: readText(item.body),
      createdAt: item.createdAt,
      id: typeof item.id === "string" && item.id ? item.id : undefined,
      title: item.title,
      type: item.type,
    };
  });
}

function parseLeads(
  payload: unknown,
  accountId: string,
  limit: number,
): { leads: PanelLead[]; missingLeads: number } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new PanelError(INVALID_RESPONSE_MESSAGE);
  }

  const leads = new Map<string, PanelLead>();

  for (const item of payload.data) {
    if (
      !isRecord(item) ||
      !isDateText(item.createdAt) ||
      !isSameId(item.accountId, accountId) ||
      typeof item.id !== "string"
    ) {
      throw new PanelError(INVALID_RESPONSE_MESSAGE);
    }

    const contactId = isPanelId(item.contactId) ? item.contactId : undefined;
    const contact =
      contactId !== undefined &&
      isRecord(item.contact) &&
      isSameId(item.contact.id, contactId)
        ? item.contact
        : {};

    if (!leads.has(item.id)) {
      leads.set(item.id, {
        contactCreatedAt: isDateText(contact.createdAt)
          ? contact.createdAt
          : undefined,
        contactId,
        contactUpdatedAt: isDateText(contact.updatedAt)
          ? contact.updatedAt
          : undefined,
        createdAt: item.createdAt,
        email: readText(item.email),
        id: item.id,
        name: readText(item.name),
        phone: readText(item.phone),
      });
    }
  }

  const sorted = [...leads.values()]
    .sort(
      (first, second) =>
        Date.parse(second.createdAt) - Date.parse(first.createdAt),
    )
    .slice(0, limit);
  const total = isRecord(payload.pagination)
    ? payload.pagination.total
    : undefined;

  return {
    leads: sorted,
    missingLeads: isCount(total)
      ? Math.max(0, Math.min(limit, total) - sorted.length)
      : 0,
  };
}

function readErrorName(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : "";
}

function readRetryAfter(value: null | string, now: number): number | undefined {
  const text = value?.trim() ?? "";

  if (RETRY_AFTER_SECONDS_PATTERN.test(text)) {
    return Number(text) * 1000;
  }

  const date = Date.parse(text);

  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function requestOnce(
  { environment, session, signal }: PanelAccess,
  url: URL,
): Promise<RequestOutcome> {
  let response: PanelResponse;

  try {
    response = await environment.fetch(url.href, {
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + session.accessToken,
        "x-actor-email": session.actorEmail,
      },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    return readErrorName(error) === "TimeoutError"
      ? { error: new PanelError(TIMEOUT_MESSAGE), ok: false, retryable: false }
      : {
          error: new PanelError(NETWORK_FAILURE_MESSAGE),
          ok: false,
          retryable: true,
        };
  }

  if (response.status < 200 || response.status > 299) {
    return describeStatus(response, environment.now());
  }

  try {
    return { data: await response.json(), ok: true };
  } catch (error) {
    const name = readErrorName(error);

    if (name === "TimeoutError") {
      return {
        error: new PanelError(TIMEOUT_MESSAGE),
        ok: false,
        retryable: false,
      };
    }

    return name === "SyntaxError"
      ? {
          error: new PanelError(INVALID_JSON_MESSAGE),
          ok: false,
          retryable: false,
        }
      : {
          error: new PanelError(INCOMPLETE_RESPONSE_MESSAGE),
          ok: false,
          retryable: true,
        };
  }
}

async function requestPanelData(
  access: PanelAccess,
  path: string,
  parameters: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, PANEL_API_ORIGIN);

  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }

  if (url.origin !== PANEL_API_ORIGIN) {
    throw new PanelError(UNKNOWN_FAILURE_MESSAGE);
  }

  for (const delay of [...RETRY_DELAYS_MS, undefined]) {
    if (access.signal.aborted) {
      throw new PanelError(UNKNOWN_FAILURE_MESSAGE);
    }

    const outcome = await requestOnce(access, url);

    if (outcome.ok) {
      return outcome.data;
    }

    if (
      !outcome.retryable ||
      delay === undefined ||
      access.signal.aborted ||
      (outcome.retryAfter ?? 0) > RETRY_AFTER_LIMIT_MS
    ) {
      throw outcome.error;
    }

    await access.environment.wait(Math.max(delay, outcome.retryAfter ?? 0));
  }

  throw new PanelError(UNKNOWN_FAILURE_MESSAGE);
}

async function runLimited<Item>(
  items: Item[],
  limit: number,
  run: (item: Item) => Promise<void>,
): Promise<void> {
  const pending = [...items];
  let stopped = false;

  await Promise.all(
    Array.from({ length: Math.min(limit, pending.length) }, async () => {
      while (!stopped) {
        const item = pending.shift();

        if (item === undefined) {
          return;
        }

        try {
          await run(item);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    }),
  );
}
