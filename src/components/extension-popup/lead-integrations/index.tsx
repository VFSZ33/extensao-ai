import { ListChecks } from "lucide-react";
import { useId, useState } from "react";

import type { SubmissionHistoryProps } from "@/components/extension-popup/submission-history";

import { Button } from "@/components/button";
import { LeadCard } from "@/components/extension-popup/lead-integrations/lead-card";
import { StatusLabel } from "@/components/extension-popup/lead-integrations/status-label";
import {
  countLeadsByStatus,
  LEAD_STATUS_LABELS,
  type LeadStatus,
  type VerifiedLead,
} from "@/lib/integration-status";
import { verifyPanelLeads } from "@/lib/panel-leads";

export type LeadIntegrationsProps = {
  history: SubmissionHistoryProps["history"];
};

type VerificationState =
  | { leads: VerifiedLead[]; status: "ready" }
  | { message: string; status: "error" }
  | { status: "idle" | "loading" };

const SUMMARY_STATUSES: LeadStatus[] = [
  "ok",
  "error",
  "pending",
  "no-events",
  "unavailable",
];

export function LeadIntegrations({ history }: LeadIntegrationsProps) {
  const sectionId = useId();
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
  });
  const counts =
    verification.status === "ready"
      ? countLeadsByStatus(verification.leads)
      : undefined;
  const submissionIds =
    history.status === "ready"
      ? history.records.map(({ id }) => id)
      : undefined;

  async function handleVerify() {
    setVerification({ status: "loading" });

    try {
      const { leads } = await verifyPanelLeads();
      setVerification({ leads, status: "ready" });
    } catch (error) {
      setVerification({
        message:
          error instanceof Error && error.message
            ? error.message
            : "Não foi possível verificar as integrações.",
        status: "error",
      });
    }
  }

  return (
    <section
      aria-labelledby={sectionId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
    >
      <h2 className="popup-section-title" id={sectionId}>
        Integrações dos leads
      </h2>
      <p>
        Confere o envio dos 10 leads mais recentes da conta aberta no painel a
        cada integração. A sessão do painel é lida só neste clique, usada apenas
        para consultar, e nada é gravado.
      </p>
      <Button
        loading={verification.status === "loading"}
        loadingLabel="Verificando integrações…"
        onClick={handleVerify}
      >
        <ListChecks aria-hidden />
        Verificar integrações
      </Button>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="flex flex-col gap-3"
      >
        {verification.status === "error" && (
          <p className="wrap-anywhere text-feedback-error">
            {verification.message}
          </p>
        )}
        {counts && verification.status === "ready" && (
          <>
            <p className="text-text-secondary">
              {verification.leads.length === 0
                ? "Esta conta não tem leads."
                : verification.leads.length === 1
                  ? "1 lead verificado."
                  : verification.leads.length + " leads verificados."}
            </p>
            {verification.leads.length > 0 && (
              <ul
                aria-label="Resumo por status"
                className="flex flex-wrap gap-x-3 gap-y-1"
              >
                {SUMMARY_STATUSES.filter(
                  (status) => status !== "unavailable" || counts[status] > 0,
                ).map((status) => (
                  <li key={status}>
                    <StatusLabel status={status}>
                      {LEAD_STATUS_LABELS[status] + ": " + counts[status]}
                    </StatusLabel>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {verification.status === "ready" && verification.leads.length > 0 && (
        <ul aria-label="Leads verificados" className="flex flex-col gap-3">
          {verification.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} submissionIds={submissionIds} />
          ))}
        </ul>
      )}
    </section>
  );
}
