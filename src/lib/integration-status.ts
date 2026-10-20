import { isRecord } from "@/lib/is-record";

export type ClassifyOptions = { partialList: boolean };

export type HistoryReading =
  | { events: IntegrationEvent[]; status: "ready" }
  | { reason: string; status: "unavailable" };

export type IntegrationEvent = {
  body: string;
  createdAt: string;
  id: string | undefined;
  title: string;
  type: string;
};

export type IntegrationStatus = "error" | "not-confirmed" | "ok" | "pending";

export type LeadIntegration = {
  message: string;
  name: string;
  reason: string;
  status: IntegrationStatus;
};

export type LeadIntegrationReport = {
  leads: VerifiedLead[];
  missingLeads: number;
};

export type LeadStatus = "no-events" | "unavailable" | IntegrationStatus;

export type PanelLead = {
  contactCreatedAt: string | undefined;
  contactId: string | undefined;
  contactUpdatedAt: string | undefined;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  phone: string;
};

export type VerifiedLead = {
  createdAt: string;
  email: string;
  id: string;
  integrations: LeadIntegration[];
  name: string;
  phone: string;
  reason: string;
  status: LeadStatus;
};

type Attempt = { scope: AttemptScope } & TimedEvent;

type AttemptScope = "automatic" | "later" | "uncertain";

type Conclusion = Omit<LeadIntegration, "name">;

type TimedEvent = { event: IntegrationEvent; time: number };

export const AUTOMATIC_ATTEMPT_WINDOW_MS = 60000;
export const CONTACT_DATE_TOLERANCE_MS = 2000;
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  error: "Erro",
  "no-events": "Sem evento",
  "not-confirmed": "Não confirmado",
  ok: "OK",
  pending: "Pendente",
  unavailable: "Não consultado",
};
export const LEAD_STATUS_PRIORITY: LeadStatus[] = [
  "error",
  "not-confirmed",
  "pending",
  "unavailable",
  "ok",
  "no-events",
];

const INFO_TYPE = "INFO";
const INTEGRATION_STATUSES: IntegrationStatus[] = [
  "error",
  "not-confirmed",
  "ok",
  "pending",
];
const LATER_ATTEMPTS_REASON =
  "há tentativas posteriores que podem ser de outro lead do mesmo contato";
const MANUAL_RESEND_PREFIX = /^reenvio manual\s*-\s*/i;
const NO_AUTOMATIC_ATTEMPT_REASON =
  "não houve tentativa nos 60 s após a criação do lead, e as tentativas seguintes podem ser de outro lead do mesmo contato";
const NO_CONTACT_REASON = "A API não informou o contato deste lead.";
const NOT_QUERIED_REASON = "O histórico deste contato não foi consultado.";
const SAME_CREATION_REASON =
  "outro lead do mesmo contato foi criado no mesmo instante";
const SAME_INSTANT_REASON = "sucesso e falha registrados no mesmo instante";
const SUCCESS_TYPE = "SUCCESS";

export function classifyLeads(
  leads: PanelLead[],
  histories: ReadonlyMap<string, HistoryReading>,
  { partialList }: ClassifyOptions,
): VerifiedLead[] {
  const classified = new Map<PanelLead, LeadIntegration[]>();

  for (const [contactId, contactLeads] of Map.groupBy(
    leads,
    ({ contactId }) => contactId,
  )) {
    const reading =
      contactId === undefined ? undefined : histories.get(contactId);

    if (reading?.status === "ready") {
      for (const [lead, integrations] of classifyContact(
        contactLeads,
        reading.events,
        partialList,
      )) {
        classified.set(lead, integrations);
      }
    }
  }

  return leads.map((lead) => {
    const integrations = classified.get(lead);
    const reading =
      lead.contactId === undefined ? undefined : histories.get(lead.contactId);

    if (integrations) {
      return createVerifiedLead(
        lead,
        integrations,
        "",
        describeLead(integrations),
      );
    }

    return createVerifiedLead(
      lead,
      [],
      lead.contactId === undefined
        ? NO_CONTACT_REASON
        : reading?.status === "unavailable"
          ? reading.reason
          : NOT_QUERIED_REASON,
      "unavailable",
    );
  });
}

export function countLeadsByStatus(
  leads: VerifiedLead[],
): Record<LeadStatus, number> {
  const counts: Record<LeadStatus, number> = {
    error: 0,
    "no-events": 0,
    "not-confirmed": 0,
    ok: 0,
    pending: 0,
    unavailable: 0,
  };

  for (const lead of leads) {
    counts[lead.status] += 1;
  }

  return counts;
}

export function isLeadIntegrationReport(
  value: unknown,
): value is LeadIntegrationReport {
  return (
    isRecord(value) &&
    Array.isArray(value.leads) &&
    value.leads.every(isVerifiedLead) &&
    Number.isSafeInteger(value.missingLeads) &&
    Number(value.missingLeads) >= 0
  );
}

function classifyContact(
  leads: PanelLead[],
  events: IntegrationEvent[],
  partialList: boolean,
): Map<PanelLead, LeadIntegration[]> {
  const ordered = leads.toSorted(
    (first, second) =>
      Date.parse(first.createdAt) - Date.parse(second.createdAt),
  );
  const firstLeadAt = readEarliest(
    ordered.map(({ contactCreatedAt }) => contactCreatedAt),
  );
  const latestLeadAt = readLatest(
    ordered.map(({ contactUpdatedAt }) => contactUpdatedAt),
  );
  const timeline = deduplicateEvents(events)
    .map((event) => ({ event, time: Date.parse(event.createdAt) }))
    .sort((first, second) => first.time - second.time);
  const times = ordered.map(({ createdAt }) => Date.parse(createdAt));
  const newest = times.at(-1) ?? 0;
  const nextTimes = times.map(
    (time) => times.find((other) => other > time) ?? Infinity,
  );
  const singleLead =
    !partialList &&
    times.length === 1 &&
    isNear(firstLeadAt, newest) &&
    isNear(latestLeadAt, newest);
  const unknownNewerCut =
    latestLeadAt !== undefined &&
    latestLeadAt > newest + CONTACT_DATE_TOLERANCE_MS
      ? latestLeadAt - CONTACT_DATE_TOLERANCE_MS
      : Infinity;
  const automaticAttempts = times.map((time, index) =>
    findAutomaticAttempts(
      timeline,
      time,
      Math.min(
        nextTimes[index] ?? Infinity,
        time === newest ? unknownNewerCut : Infinity,
      ),
    ),
  );

  return new Map(
    ordered.map((lead, index) => {
      const start = times[index] ?? 0;
      const attempts: Attempt[] = [];
      const automatic = automaticAttempts[index];

      for (const timed of timeline) {
        if (timed.time < start) {
          continue;
        }

        if (automatic?.has(timed)) {
          attempts.push({ ...timed, scope: "automatic" });
          continue;
        }

        const ownedByNewer = times.some(
          (other, otherIndex) =>
            other > start && automaticAttempts[otherIndex]?.has(timed),
        );

        if (!ownedByNewer) {
          attempts.push({
            ...timed,
            scope: singleLead ? "later" : "uncertain",
          });
        }
      }

      return [
        lead,
        classifyIntegrations(
          attempts,
          times.some(
            (other, otherIndex) => otherIndex !== index && other === start,
          ),
        ),
      ];
    }),
  );
}

function classifyIntegrations(
  attempts: Attempt[],
  sharedCreation: boolean,
): LeadIntegration[] {
  return Array.from(
    Map.groupBy(attempts, ({ event }) => readIntegrationName(event.title)),
    ([name, group]): LeadIntegration => {
      if (sharedCreation) {
        return createIntegration(name, notConfirmed(SAME_CREATION_REASON));
      }

      const confirmed = conclude(
        group.filter(({ scope }) => scope !== "uncertain"),
      );

      if (group.every(({ scope }) => scope !== "uncertain") && confirmed) {
        return createIntegration(name, confirmed);
      }

      if (!confirmed) {
        return createIntegration(
          name,
          notConfirmed(NO_AUTOMATIC_ATTEMPT_REASON),
        );
      }

      return createIntegration(
        name,
        confirmed.status !== "pending" &&
          conclude(group)?.status === confirmed.status
          ? confirmed
          : notConfirmed(LATER_ATTEMPTS_REASON),
      );
    },
  ).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function conclude(events: TimedEvent[]): Conclusion | undefined {
  if (events.length === 0) {
    return undefined;
  }

  const conclusive = events.filter(({ event }) => event.type !== INFO_TYPE);
  const concludedAt = Math.max(...conclusive.map(({ time }) => time));

  if (
    events.some(
      ({ event, time }) => event.type === INFO_TYPE && time > concludedAt,
    )
  ) {
    return { message: "", reason: "", status: "pending" };
  }

  const latest = conclusive.filter(({ time }) => time === concludedAt);
  const failure = latest.findLast(({ event }) => event.type !== SUCCESS_TYPE);

  if (failure && latest.some(({ event }) => event.type === SUCCESS_TYPE)) {
    return notConfirmed(SAME_INSTANT_REASON);
  }

  return failure
    ? { message: failure.event.body, reason: "", status: "error" }
    : { message: "", reason: "", status: "ok" };
}

function createIntegration(
  name: string,
  { message, reason, status }: Conclusion,
): LeadIntegration {
  return { message, name, reason, status };
}

function createVerifiedLead(
  lead: PanelLead,
  integrations: LeadIntegration[],
  reason: string,
  status: LeadStatus,
): VerifiedLead {
  return {
    createdAt: lead.createdAt,
    email: lead.email,
    id: lead.id,
    integrations,
    name: lead.name,
    phone: lead.phone,
    reason,
    status,
  };
}

function deduplicateEvents(events: IntegrationEvent[]): IntegrationEvent[] {
  const seen = new Set<string>();

  return events.filter(({ id }) => {
    if (!id) {
      return true;
    }

    if (seen.has(id)) {
      return false;
    }

    seen.add(id);

    return true;
  });
}

function describeLead(integrations: LeadIntegration[]): LeadStatus {
  return (
    LEAD_STATUS_PRIORITY.find((status) =>
      integrations.some((integration) => integration.status === status),
    ) ?? "no-events"
  );
}

function findAutomaticAttempts(
  timeline: TimedEvent[],
  start: number,
  cut: number,
): Set<TimedEvent> {
  const automatic = new Set<TimedEvent>();
  const candidates = timeline.filter(
    ({ event, time }) =>
      time >= start &&
      time < cut &&
      time - start <= AUTOMATIC_ATTEMPT_WINDOW_MS &&
      !MANUAL_RESEND_PREFIX.test(event.title.trim()),
  );

  for (const group of Map.groupBy(candidates, ({ event }) =>
    readIntegrationName(event.title),
  ).values()) {
    const conclusion = group.find(({ event }) => event.type !== INFO_TYPE);

    for (const timed of group) {
      if (!conclusion || timed.time <= conclusion.time) {
        automatic.add(timed);
      }
    }
  }

  return automatic;
}

function isLeadIntegration(value: unknown): value is LeadIntegration {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    typeof value.name === "string" &&
    typeof value.reason === "string" &&
    INTEGRATION_STATUSES.some((status) => status === value.status)
  );
}

function isNear(value: number | undefined, time: number): boolean {
  return (
    value !== undefined && Math.abs(value - time) <= CONTACT_DATE_TOLERANCE_MS
  );
}

function isVerifiedLead(value: unknown): value is VerifiedLead {
  return (
    isRecord(value) &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.email === "string" &&
    typeof value.id === "string" &&
    Array.isArray(value.integrations) &&
    value.integrations.every(isLeadIntegration) &&
    typeof value.name === "string" &&
    typeof value.phone === "string" &&
    typeof value.reason === "string" &&
    typeof value.status === "string" &&
    Object.hasOwn(LEAD_STATUS_LABELS, value.status)
  );
}

function notConfirmed(reason: string): Conclusion {
  return { message: "", reason, status: "not-confirmed" };
}

function readEarliest(values: (string | undefined)[]): number | undefined {
  const times = readTimes(values);

  return times.length > 0 ? Math.min(...times) : undefined;
}

function readIntegrationName(title: string): string {
  return title.trim().replace(MANUAL_RESEND_PREFIX, "").trim();
}

function readLatest(values: (string | undefined)[]): number | undefined {
  const times = readTimes(values);

  return times.length > 0 ? Math.max(...times) : undefined;
}

function readTimes(values: (string | undefined)[]): number[] {
  return values.flatMap((value) => {
    const time = value === undefined ? Number.NaN : Date.parse(value);

    return Number.isNaN(time) ? [] : [time];
  });
}
