import { Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/button";
import { Confirmation } from "@/components/confirmation";
import { formatDateTime } from "@/lib/date-time";
import {
  clearSubmissionHistory,
  HISTORY_MAX_RECORDS,
  HISTORY_RETENTION_DAYS,
  type SubmissionRecord,
} from "@/lib/submission-history";

export type SubmissionHistoryProps = {
  history:
    | { records: SubmissionRecord[]; status: "ready" }
    | { status: "error" | "loading" };
  onCleared: () => void;
};

export function SubmissionHistory({
  history,
  onCleared,
}: SubmissionHistoryProps) {
  const clearButton = useRef<HTMLElement>(null);
  const [clearing, setClearing] = useState<"confirming" | "idle" | "loading">(
    "idle",
  );
  const [feedback, setFeedback] = useState<"cleared" | "error" | "none">(
    "none",
  );
  const recordCount = history.status === "ready" ? history.records.length : 0;
  const sectionId = useId();

  function handleCancel() {
    setClearing("idle");
    clearButton.current?.focus();
  }

  async function handleClear() {
    setClearing("loading");

    try {
      await clearSubmissionHistory();
      setFeedback("cleared");
    } catch {
      setFeedback("error");
    }

    setClearing("idle");
    clearButton.current?.focus();
    onCleared();
  }

  function handleOpen() {
    setFeedback("none");
    setClearing("confirming");
  }

  return (
    <section
      aria-labelledby={sectionId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
    >
      <h2 className="popup-section-title" id={sectionId}>
        Histórico de envios
      </h2>
      <p className="text-text-secondary">
        {"Guarda neste navegador os " +
          HISTORY_MAX_RECORDS +
          " envios mais recentes, por até " +
          HISTORY_RETENTION_DAYS +
          " dias."}
      </p>
      <Button
        aria-expanded={clearing !== "idle"}
        disabled={recordCount === 0 || clearing === "loading"}
        focusableWhenDisabled
        onClick={handleOpen}
        ref={clearButton}
        variant="secondary"
      >
        <Trash2 aria-hidden />
        Limpar histórico
      </Button>
      {clearing !== "idle" && (
        <Confirmation
          confirmLabel="Apagar histórico"
          confirmVariant="destructive"
          loading={clearing === "loading"}
          loadingLabel="Apagando…"
          onCancel={handleCancel}
          onConfirm={handleClear}
          title="Limpar o histórico de envios?"
        >
          <p>
            {(recordCount === 1
              ? "O envio registrado será apagado"
              : "Os " + recordCount + " envios registrados serão apagados") +
              " deste navegador. Os leads continuam nos sites e no painel, e a sequência dos identificadores não recomeça."}
          </p>
        </Confirmation>
      )}
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
                  {formatDateTime(record.submittedAt)}
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
      <div aria-atomic="true" aria-live="polite">
        {feedback === "cleared" && (
          <p className="text-action-primary">Histórico limpo.</p>
        )}
        {feedback === "error" && (
          <p className="text-feedback-error">
            Não foi possível limpar o histórico. Tente de novo.
          </p>
        )}
      </div>
    </section>
  );
}
