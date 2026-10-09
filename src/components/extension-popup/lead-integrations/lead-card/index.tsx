import { FlaskConical } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { StatusLabel } from "@/components/extension-popup/lead-integrations/status-label";
import { formatDateTime } from "@/lib/date-time";
import {
  LEAD_STATUS_LABELS,
  type VerifiedLead,
} from "@/lib/integration-status";
import { findSubmissionId } from "@/lib/lead-data";

export type LeadCardProps = {
  lead: VerifiedLead;
  submissionIds: string[] | undefined;
};

export function LeadCard({ lead, submissionIds }: LeadCardProps) {
  const submissionId =
    findSubmissionId(lead.name) ?? findSubmissionId(lead.email);

  return (
    <li
      className={twMerge(
        "flex flex-col gap-2 rounded-(--radius-input) border border-border-subtle p-3",
        submissionId && "border-action-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium wrap-anywhere">
          {lead.name || "Lead sem nome"}
        </p>
        <div className="shrink-0">
          <StatusLabel status={lead.status}>
            {LEAD_STATUS_LABELS[lead.status]}
          </StatusLabel>
        </div>
      </div>
      {(lead.email || lead.phone) && (
        <p className="wrap-anywhere text-text-secondary">
          {[lead.email, lead.phone].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="text-text-secondary">
        <time dateTime={lead.createdAt}>{formatDateTime(lead.createdAt)}</time>
      </p>
      {submissionId && (
        <div className="flex items-start gap-2 text-action-primary">
          <span className="flex h-5 shrink-0 items-center">
            <FlaskConical aria-hidden className="size-(--spacing-icon-sm)" />
          </span>
          <p className="min-w-0 wrap-anywhere">
            {"Lead de teste " +
              submissionId +
              (submissionIds === undefined
                ? ""
                : submissionIds.includes(submissionId)
                  ? " · consta no histórico de envios"
                  : " · não consta no histórico de envios desta extensão")}
          </p>
        </div>
      )}
      {lead.integrations.length > 0 && (
        <ul aria-label="Integrações" className="flex flex-col gap-1">
          {lead.integrations.map((integration) => (
            <li key={integration.name}>
              <StatusLabel status={integration.status}>
                {(integration.name || "Integração sem nome") +
                  " — " +
                  LEAD_STATUS_LABELS[integration.status] +
                  (integration.status === "error"
                    ? ": " +
                      (integration.message || "motivo não informado pela API")
                    : "")}
              </StatusLabel>
            </li>
          ))}
        </ul>
      )}
      {lead.status === "no-events" && (
        <p className="text-text-secondary">
          Nenhum evento de integração para este lead.
        </p>
      )}
      {lead.status === "unavailable" && (
        <p className="text-text-secondary">
          Não foi possível consultar as integrações deste lead.
        </p>
      )}
    </li>
  );
}
