import type { PanelQuery } from "@/lib/panel-query";

import { formatDateTime } from "@/lib/date-time";
import {
  countLeadsByStatus,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_PRIORITY,
  type LeadIntegration,
  type LeadIntegrationReport,
  type VerifiedLead,
} from "@/lib/integration-status";

export type DiagnosticReportInput = {
  checkedAt: string;
  query: PanelQuery;
  report: LeadIntegrationReport;
};

const BEARER_PATTERN = /\bbearer\s+\S+/gi;
const EMAIL_PATTERN = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
const NUMBER_PATTERN =
  /(?<![\w-])(?:\d{3}\.\d{3}\.\d{3}-\d{2}|(?:\+55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}|\d{10,14})(?!\w)/g;
const TOKEN_PATTERN = /[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;

export function createDiagnosticReport({
  checkedAt,
  query,
  report,
}: DiagnosticReportInput): string {
  const counts = countLeadsByStatus(report.leads);
  const gaps = describeIncompleteness(report);

  return [
    "Diagnóstico das integrações — Scanner de Leads",
    "Consulta: " + formatDateTime(checkedAt),
    "Escopo: " + describeScope(query),
    "Leads devolvidos: " + report.leads.length,
    "Situação: " +
      (gaps.length === 0 ? "concluída" : "incompleta — " + gaps.join("; ")),
    "Por status: " +
      LEAD_STATUS_PRIORITY.map(
        (status) => LEAD_STATUS_LABELS[status] + " " + counts[status],
      ).join(", "),
    ...report.leads.flatMap((lead, index) => [
      "",
      ...describeLead(lead, index + 1, report.leads.length),
    ]),
  ].join("\n");
}

export function describeIncompleteness({
  leads,
  missingLeads,
}: LeadIntegrationReport): string[] {
  const unavailable = leads.filter(
    ({ status }) => status === "unavailable",
  ).length;

  return [
    ...(unavailable === 0
      ? []
      : [
          unavailable === 1
            ? "1 lead ficou sem consulta ao histórico de integrações"
            : unavailable +
              " leads ficaram sem consulta ao histórico de integrações",
        ]),
    ...(missingLeads === 0
      ? []
      : [
          missingLeads === 1
            ? "a API deixou de devolver 1 lead que informou existir"
            : "a API deixou de devolver " +
              missingLeads +
              " leads que informou existir",
        ]),
  ];
}

export function redactPersonalData(text: string): string {
  return text
    .replace(BEARER_PATTERN, "[token omitido]")
    .replace(TOKEN_PATTERN, "[token omitido]")
    .replace(EMAIL_PATTERN, "[e-mail omitido]")
    .replace(NUMBER_PATTERN, "[número omitido]");
}

function describeIntegration({
  message,
  name,
  reason,
  status,
}: LeadIntegration): string {
  const detail =
    status === "error"
      ? message || "motivo não informado pela API"
      : status === "not-confirmed"
        ? reason
        : "";

  return redactPersonalData(
    "- " +
      (name || "Integração sem nome") +
      ": " +
      LEAD_STATUS_LABELS[status] +
      (detail ? " — " + detail : ""),
  );
}

function describeLead(
  lead: VerifiedLead,
  position: number,
  total: number,
): string[] {
  return [
    "Lead " + position + " de " + total,
    "Identificador: " + lead.id,
    "Nome: " + (redactPersonalData(lead.name) || "sem nome"),
    "Criado em: " + formatDateTime(lead.createdAt),
    "Status: " +
      LEAD_STATUS_LABELS[lead.status] +
      (lead.reason ? " — " + redactPersonalData(lead.reason) : ""),
    ...(lead.status === "no-events"
      ? ["- Nenhum evento de integração para este lead."]
      : lead.integrations.map(describeIntegration)),
  ];
}

function describeScope({ limit, search }: PanelQuery): string {
  return search
    ? "busca na API por “" +
        redactPersonalData(search) +
        "”, até " +
        limit +
        " leads"
    : "os " + limit + " leads mais recentes da conta";
}
