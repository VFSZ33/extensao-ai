import type { SubmissionTracking } from "@/hooks/use-submission-tracking";

import { StatusLabel } from "@/components/extension-popup/lead-integrations/status-label";
import { formatDateTime } from "@/lib/date-time";
import {
  describeIntegration,
  LEAD_STATUS_LABELS,
} from "@/lib/integration-status";
import {
  TRACKING_DURATION_MS,
  TRACKING_INTERVAL_MS,
} from "@/lib/submission-tracking";

export type TrackingStatusProps = {
  enabled: boolean;
  submissionId: string;
  tracking: SubmissionTracking;
};

export function TrackingStatus({
  enabled,
  submissionId,
  tracking,
}: TrackingStatusProps) {
  const { check, checkedAt, expired, nextAt, running } = tracking;
  const manualCheck =
    "Confira em Integrações dos leads, com o painel aberto, buscando por " +
    submissionId +
    ".";

  return (
    <div
      aria-label="Acompanhamento no painel"
      className="flex flex-col gap-2 border-t border-border-subtle pt-2"
      role="group"
    >
      <div
        aria-atomic="true"
        aria-live="polite"
        className="flex flex-col gap-1"
      >
        {!check && running && (
          <p className="text-text-secondary">Consultando o painel…</p>
        )}
        {check?.status === "found" && (
          <>
            <StatusLabel status={check.lead.status}>
              {"No painel: " + LEAD_STATUS_LABELS[check.lead.status]}
            </StatusLabel>
            {check.lead.integrations.length > 0 && (
              <div className="flex flex-col gap-1">
                {check.lead.integrations.map((integration) => (
                  <StatusLabel
                    key={integration.name}
                    status={integration.status}
                  >
                    {describeIntegration(integration)}
                  </StatusLabel>
                ))}
              </div>
            )}
          </>
        )}
        {check?.status === "not-found" && (
          <p className="text-text-secondary">
            O lead ainda não apareceu na conta aberta no painel.
          </p>
        )}
        {check?.status === "no-panel" && (
          <p className="wrap-anywhere text-text-secondary">
            {"Para acompanhar aqui, abra no painel a lista de leads da conta. " +
              manualCheck}
          </p>
        )}
        {check?.status === "no-access" && (
          <p className="wrap-anywhere text-text-secondary">
            {"A extensão não tem acesso à aba do painel: abra o painel lateral nela e permita o acesso. " +
              manualCheck}
          </p>
        )}
        {check?.status === "error" && (
          <p className="wrap-anywhere text-feedback-warning">
            {"Não foi possível consultar o painel: " +
              check.message +
              " " +
              manualCheck}
          </p>
        )}
        {expired && (
          <p className="text-text-secondary">
            {"Acompanhamento encerrado depois de " +
              TRACKING_DURATION_MS / 60000 +
              " min."}
          </p>
        )}
        {nextAt !== undefined && !enabled && (
          <p className="text-text-secondary">
            Acompanhamento pausado: a atualização automática está desativada.
          </p>
        )}
      </div>
      {checkedAt && (
        <p className="popup-detail text-text-muted">
          {"Consultado em "}
          <time dateTime={checkedAt}>{formatDateTime(checkedAt)}</time>
          {nextAt !== undefined && enabled
            ? running
              ? "; consultando de novo…"
              : "; nova consulta a cada " +
                TRACKING_INTERVAL_MS / 1000 +
                " s enquanto estiver pendente ou sem evento."
            : "."}
        </p>
      )}
    </div>
  );
}
