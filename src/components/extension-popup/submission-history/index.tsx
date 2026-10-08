import { useId } from "react";

import type { SubmissionRecord } from "@/lib/submission-history";

export type SubmissionHistoryProps = {
  history:
    | { records: SubmissionRecord[]; status: "ready" }
    | { status: "error" | "loading" };
};

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
});

export function SubmissionHistory({ history }: SubmissionHistoryProps) {
  const sectionId = useId();

  return (
    <section
      aria-labelledby={sectionId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
    >
      <h2 className="popup-section-title" id={sectionId}>
        Histórico de envios
      </h2>
      {history.status === "loading" && (
        <p className="text-text-secondary">Carregando histórico…</p>
      )}
      {history.status === "error" && (
        <p className="text-feedback-error">
          Não foi possível ler o histórico de envios.
        </p>
      )}
      {history.status === "ready" && history.records.length === 0 && (
        <p className="text-text-secondary">Nenhum envio registrado.</p>
      )}
      {history.status === "ready" && history.records.length > 0 && (
        <ul className="flex flex-col gap-3">
          {history.records.map((record) => (
            <li
              className="flex flex-col gap-2 rounded-(--radius-input) border border-border-subtle p-3"
              key={record.id}
            >
              <p className="font-medium wrap-anywhere">{record.id}</p>
              <p className="wrap-anywhere text-text-secondary">
                {[record.definitionName, record.formLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="wrap-anywhere text-text-secondary">
                <time dateTime={record.submittedAt}>
                  {dateTimeFormat.format(new Date(record.submittedAt))}
                </time>
                {record.pageUrl && " · " + record.pageUrl}
              </p>
              <dl className="popup-detail grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {Object.entries(record.values).map(([key, value]) => (
                  <div className="contents" key={key}>
                    <dt className="text-text-muted">{key}</dt>
                    <dd className="wrap-anywhere">
                      {typeof value === "string"
                        ? value
                        : typeof value === "object"
                          ? value.label +
                            " (" +
                            (value.value || "sem valor") +
                            ")"
                          : value
                            ? "marcado"
                            : "desmarcado"}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
