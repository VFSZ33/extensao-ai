import { isRecord } from "@/lib/is-record";

export type IntegrationEvent = {
  body: string;
  createdAt: string;
  title: string;
  type: string;
};

export type IntegrationStatus = "error" | "ok" | "pending";

export type LeadIntegration = {
  message: string;
  name: string;
  status: IntegrationStatus;
};

export type LeadIntegrationReport = { leads: VerifiedLead[] };

export type LeadStatus = "no-events" | "unavailable" | IntegrationStatus;

export type PanelLead = {
  contactId: string | undefined;
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
  status: LeadStatus;
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  error: "Erro",
  "no-events": "Sem evento",
  ok: "OK",
  pending: "Pendente",
  unavailable: "Não consultado",
};

const INFO_TYPE = "INFO";
const MANUAL_RESEND_PREFIX = /^reenvio manual\s*-\s*/i;
const SUCCESS_TYPE = "SUCCESS";

export function classifyLeads(
  leads: PanelLead[],
  histories: ReadonlyMap<string, IntegrationEvent[]>,
): VerifiedLead[] {
  return leads.map((lead) => {
    const events =
      lead.contactId === undefined ? undefined : histories.get(lead.contactId);
    const integrations = events
      ? classifyIntegrations(selectLeadEvents(lead, leads, events))
      : [];

    return {
      createdAt: lead.createdAt,
      email: lead.email,
      id: lead.id,
      integrations,
      name: lead.name,
      phone: lead.phone,
      status: events ? describeLead(integrations) : "unavailable",
    };
  });
}

export function countLeadsByStatus(
  leads: VerifiedLead[],
): Record<LeadStatus, number> {
  const counts: Record<LeadStatus, number> = {
    error: 0,
    "no-events": 0,
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
    value.leads.every(isVerifiedLead)
  );
}

function classifyIntegrations(events: IntegrationEvent[]): LeadIntegration[] {
  const attempts = Map.groupBy(
    events.toSorted(
      (first, second) =>
        Date.parse(first.createdAt) - Date.parse(second.createdAt),
    ),
    (event) => event.title.trim().replace(MANUAL_RESEND_PREFIX, "").trim(),
  );

  return Array.from(attempts, ([name, attempt]): LeadIntegration => {
    const conclusive = attempt.findLast((event) => event.type !== INFO_TYPE);

    if (!conclusive) {
      return { message: "", name, status: "pending" };
    }

    return conclusive.type === SUCCESS_TYPE
      ? { message: "", name, status: "ok" }
      : { message: conclusive.body, name, status: "error" };
  }).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function describeLead(integrations: LeadIntegration[]): LeadStatus {
  if (integrations.length === 0) {
    return "no-events";
  }

  if (integrations.some(({ status }) => status === "error")) {
    return "error";
  }

  return integrations.some(({ status }) => status === "pending")
    ? "pending"
    : "ok";
}

function isLeadIntegration(value: unknown): value is LeadIntegration {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    typeof value.name === "string" &&
    (value.status === "error" ||
      value.status === "ok" ||
      value.status === "pending")
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
    typeof value.status === "string" &&
    Object.hasOwn(LEAD_STATUS_LABELS, value.status)
  );
}

function selectLeadEvents(
  lead: PanelLead,
  leads: PanelLead[],
  events: IntegrationEvent[],
): IntegrationEvent[] {
  const start = Date.parse(lead.createdAt);
  const end = Math.min(
    ...leads.flatMap((other) => {
      const time = Date.parse(other.createdAt);

      return other.contactId === lead.contactId && time > start ? [time] : [];
    }),
  );

  return events.filter((event) => {
    const time = Date.parse(event.createdAt);

    return time >= start && time < end;
  });
}
