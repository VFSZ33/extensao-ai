import { Form } from "@base-ui/react/form";
import { ListChecks } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { SubmissionHistoryProps } from "@/components/extension-popup/submission-history";

import { Button } from "@/components/button";
import { LeadCard } from "@/components/extension-popup/lead-integrations/lead-card";
import { ReportCopy } from "@/components/extension-popup/lead-integrations/report-copy";
import { StatusLabel } from "@/components/extension-popup/lead-integrations/status-label";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { formatDateTime } from "@/lib/date-time";
import { describeIncompleteness } from "@/lib/integration-report";
import {
  countLeadsByStatus,
  LEAD_STATUS_LABELS,
  type LeadIntegrationReport,
  type LeadStatus,
} from "@/lib/integration-status";
import { verifyPanelLeads } from "@/lib/panel-leads";
import {
  DEFAULT_LEAD_LIMIT,
  isLeadLimit,
  LEAD_LIMITS,
  type LeadLimit,
  type PanelQuery,
  SEARCH_MAX_LENGTH,
} from "@/lib/panel-query";

export type LeadIntegrationsProps = {
  history: SubmissionHistoryProps["history"];
};

type VerificationState =
  | { checkedAt: string; message: string; status: "error" }
  | {
      checkedAt: string;
      query: PanelQuery;
      report: LeadIntegrationReport;
      status: "ready";
    }
  | { status: "idle" | "loading" };

const LIMIT_ITEMS = LEAD_LIMITS.map((limit) => ({
  label: String(limit),
  value: String(limit),
}));
const OCCASIONAL_STATUSES: LeadStatus[] = ["not-confirmed", "unavailable"];
const SUMMARY_STATUSES: LeadStatus[] = [
  "ok",
  "error",
  "not-confirmed",
  "pending",
  "no-events",
  "unavailable",
];

export function LeadIntegrations({ history }: LeadIntegrationsProps) {
  const [limit, setLimit] = useState<LeadLimit>(DEFAULT_LEAD_LIMIT);
  const running = useRef(false);
  const [search, setSearch] = useState("");
  const sectionId = useId();
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
  });
  const counts =
    verification.status === "ready"
      ? countLeadsByStatus(verification.report.leads)
      : undefined;
  const gaps =
    verification.status === "ready"
      ? describeIncompleteness(verification.report)
      : [];
  const loading = verification.status === "loading";
  const ready = verification.status === "ready" ? verification : undefined;
  const submissionIds =
    history.status === "ready"
      ? history.records.map(({ id }) => id)
      : undefined;

  function handleLimitChange(value: null | string) {
    const next = Number(value);

    if (isLeadLimit(next)) {
      setLimit(next);
    }
  }

  async function handleVerify() {
    if (running.current) {
      return;
    }

    running.current = true;
    const checkedAt = new Date().toISOString();
    const query: PanelQuery = { limit, search: search.trim() };
    setVerification({ status: "loading" });

    try {
      const report = await verifyPanelLeads(query);
      setVerification({ checkedAt, query, report, status: "ready" });
    } catch (error) {
      setVerification({
        checkedAt,
        message:
          error instanceof Error && error.message
            ? error.message
            : "Não foi possível verificar as integrações.",
        status: "error",
      });
    } finally {
      running.current = false;
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
        Confere o envio dos leads mais recentes da conta aberta no painel a cada
        integração ou, com uma busca, dos leads que a API encontrar. A sessão do
        painel é lida só neste clique, usada apenas para consultar, e nada é
        gravado.
      </p>
      <Form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleVerify();
        }}
      >
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <TextField
              autoComplete="off"
              label="Busca (opcional)"
              maxLength={SEARCH_MAX_LENGTH}
              onValueChange={setSearch}
              placeholder="Identificador ou e-mail"
              readOnly={loading}
              type="search"
              value={search}
            />
          </div>
          <div className="w-24 shrink-0">
            <Select
              disabled={loading}
              items={LIMIT_ITEMS}
              label="Quantidade"
              onValueChange={handleLimitChange}
              value={String(limit)}
            />
          </div>
        </div>
        <Button
          loading={loading}
          loadingLabel="Verificando integrações…"
          type="submit"
        >
          <ListChecks aria-hidden />
          Verificar integrações
        </Button>
      </Form>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="flex flex-col gap-3"
      >
        {verification.status === "error" && (
          <>
            <p className="text-text-secondary">
              {"Consulta falhou em "}
              <time dateTime={verification.checkedAt}>
                {formatDateTime(verification.checkedAt)}
              </time>
              .
            </p>
            <p className="wrap-anywhere text-feedback-error">
              {verification.message}
            </p>
          </>
        )}
        {ready && counts && (
          <>
            <p
              className={
                gaps.length === 0
                  ? "text-text-secondary"
                  : "text-feedback-warning"
              }
            >
              {gaps.length === 0
                ? "Consulta concluída em "
                : "Consulta incompleta em "}
              <time dateTime={ready.checkedAt}>
                {formatDateTime(ready.checkedAt)}
              </time>
              {gaps.length === 0
                ? "."
                : ": " +
                  gaps.join("; ") +
                  ". Verifique de novo para completar."}
            </p>
            {ready.query.search && (
              <p className="wrap-anywhere text-text-secondary">
                {"Resultado da busca por “" +
                  ready.query.search +
                  "” na API, até " +
                  ready.query.limit +
                  " leads."}
              </p>
            )}
            <p className="text-text-secondary">
              {ready.report.leads.length === 0
                ? ready.query.search
                  ? "Nenhum lead encontrado nesta busca."
                  : "Esta conta não tem leads."
                : ready.report.leads.length === 1
                  ? "1 lead verificado."
                  : ready.report.leads.length + " leads verificados."}
            </p>
            {ready.report.leads.length > 0 && (
              <ul
                aria-label="Resumo por status"
                className="flex flex-wrap gap-x-3 gap-y-1"
              >
                {SUMMARY_STATUSES.filter(
                  (status) =>
                    !OCCASIONAL_STATUSES.includes(status) || counts[status] > 0,
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
      {ready && (
        <ReportCopy
          checkedAt={ready.checkedAt}
          query={ready.query}
          report={ready.report}
        />
      )}
      {ready && ready.report.leads.length > 0 && (
        <ul aria-label="Leads verificados" className="flex flex-col gap-3">
          {ready.report.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} submissionIds={submissionIds} />
          ))}
        </ul>
      )}
    </section>
  );
}
