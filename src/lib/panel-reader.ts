import type { PageResponse } from "@/lib/page-command";

import {
  classifyLeads,
  type IntegrationEvent,
  type LeadIntegrationReport,
  type PanelLead,
} from "@/lib/integration-status";
import { isRecord } from "@/lib/is-record";
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
};

export type PanelRequest = {
  cache: "no-store";
  credentials: "omit";
  headers: Record<string, string>;
  method: "GET";
  redirect: "error";
  signal: AbortSignal;
};

export type PanelResponse = { json: () => Promise<unknown>; status: number };

type PanelAccess = {
  accountId: string;
  environment: PanelEnvironment;
  session: PanelSession;
};

class PanelError extends Error {
  sessionExpired: boolean;

  constructor(message: string, sessionExpired = false) {
    super(message);
    this.sessionExpired = sessionExpired;
  }
}

const EXPIRED_SESSION_MESSAGE =
  "A sessão do painel expirou. Recarregue o painel ou entre de novo.";
const HISTORY_CONCURRENCY = 3;
const INVALID_RESPONSE_MESSAGE =
  "A API do painel retornou uma resposta inesperada.";
const LEAD_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 15000;
const UNKNOWN_FAILURE_MESSAGE = "Não foi possível verificar as integrações.";

export async function readPanelLeads(
  environment: PanelEnvironment,
): Promise<PageResponse<LeadIntegrationReport>> {
  try {
    return { ok: true, result: await buildReport(environment) };
  } catch (error) {
    return {
      error:
        error instanceof PanelError ? error.message : UNKNOWN_FAILURE_MESSAGE,
      ok: false,
    };
  }
}

async function buildReport(
  environment: PanelEnvironment,
): Promise<LeadIntegrationReport> {
  if (!isPanelUrl(environment.url)) {
    throw new PanelError(PANEL_REQUIRED_MESSAGE);
  }

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

  const access = { accountId, environment, session: reading.session };
  const leads = parseLeads(
    await requestPanelData(access, "/conversions", {
      accountId,
      limit: String(LEAD_LIMIT),
      page: "1",
    }),
    accountId,
  );
  const histories = new Map<string, IntegrationEvent[]>();

  await runLimited(
    [...new Set(leads.flatMap(({ contactId }) => contactId ?? []))],
    HISTORY_CONCURRENCY,
    async (contactId) => {
      try {
        const events = parseHistory(
          await requestPanelData(
            access,
            "/contacts/" + contactId + "/integration-histories",
            { accountId },
          ),
          contactId,
        );

        if (events) {
          histories.set(contactId, events);
        }
      } catch (error) {
        if (error instanceof PanelError && error.sessionExpired) {
          throw error;
        }
      }
    },
  );

  return { leads: classifyLeads(leads, histories) };
}

function isDateText(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSameId(value: unknown, expected: string): boolean {
  return (
    typeof value !== "string" || value.toLowerCase() === expected.toLowerCase()
  );
}

function parseHistory(
  payload: unknown,
  contactId: string,
): IntegrationEvent[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return undefined;
  }

  const events: IntegrationEvent[] = [];

  for (const item of payload.data) {
    if (
      !isRecord(item) ||
      !isDateText(item.createdAt) ||
      !isSameId(item.contactId, contactId) ||
      typeof item.title !== "string" ||
      typeof item.type !== "string"
    ) {
      return undefined;
    }

    events.push({
      body: readText(item.body),
      createdAt: item.createdAt,
      title: item.title,
      type: item.type,
    });
  }

  return events;
}

function parseLeads(payload: unknown, accountId: string): PanelLead[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new PanelError(INVALID_RESPONSE_MESSAGE);
  }

  return payload.data
    .map((item: unknown): PanelLead => {
      if (
        !isRecord(item) ||
        !isDateText(item.createdAt) ||
        !isSameId(item.accountId, accountId) ||
        typeof item.id !== "string"
      ) {
        throw new PanelError(INVALID_RESPONSE_MESSAGE);
      }

      return {
        contactId: isPanelId(item.contactId) ? item.contactId : undefined,
        createdAt: item.createdAt,
        email: readText(item.email),
        id: item.id,
        name: readText(item.name),
        phone: readText(item.phone),
      };
    })
    .sort(
      (first, second) =>
        Date.parse(second.createdAt) - Date.parse(first.createdAt),
    )
    .slice(0, LEAD_LIMIT);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function requestPanelData(
  { environment, session }: PanelAccess,
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PanelError(
      "Não foi possível consultar a API do painel. Confira a conexão e tente de novo.",
    );
  }

  if (response.status === 401) {
    throw new PanelError(EXPIRED_SESSION_MESSAGE, true);
  }

  if (response.status === 403) {
    throw new PanelError(
      "O seu usuário não tem acesso aos leads desta conta no painel.",
    );
  }

  if (response.status < 200 || response.status > 299) {
    throw new PanelError(
      "A API do painel respondeu com erro (HTTP " + response.status + ").",
    );
  }

  try {
    return await response.json();
  } catch {
    throw new PanelError(INVALID_RESPONSE_MESSAGE);
  }
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
