import { CircleCheck, CircleX, Clock, Send, X } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Button } from "@/components/button";
import {
  listPendingUnits,
  type QueueItem,
  type SubmissionQueue,
} from "@/lib/submission-queue";

export type QueueStatusProps = {
  cancelling: boolean;
  onCancel: () => void;
  queue: SubmissionQueue;
};

const ITEM_ICONS = {
  failed: CircleX,
  pending: Clock,
  sending: Send,
  sent: CircleCheck,
};

export function QueueStatus({ cancelling, onCancel, queue }: QueueStatusProps) {
  const pending = listPendingUnits(queue);
  const running = queue.outcome === undefined;

  return (
    <div
      aria-label="Fila de envios"
      className="flex flex-col gap-3 rounded-(--radius-input) border border-border-subtle p-3"
      role="group"
    >
      <div
        aria-atomic="true"
        aria-live="polite"
        className="flex flex-col gap-1"
      >
        <p
          className={twMerge(
            "wrap-anywhere",
            queue.outcome === "cancelled" && "text-feedback-warning",
            queue.outcome === "completed" && "text-action-primary",
            (queue.outcome === "failed" || queue.outcome === "stopped") &&
              "text-feedback-error",
          )}
        >
          {describeProgress(queue, cancelling)}
        </p>
        {queue.message && (
          <p className="wrap-anywhere text-feedback-error">{queue.message}</p>
        )}
        {!running && pending.length > 0 && (
          <p className="wrap-anywhere">
            {(pending.length === 1
              ? "Unidade pendente, sem envio: "
              : "Unidades pendentes, sem envio: ") +
              pending.map(({ label }) => label).join(", ") +
              "."}
          </p>
        )}
      </div>
      <ul aria-label="Unidades da fila" className="flex flex-col gap-2">
        {queue.items.map((item) => {
          const Icon = ITEM_ICONS[item.status];

          return (
            <li
              className="flex min-w-0 items-start gap-2"
              key={item.unit.value}
            >
              <span className="flex h-5 shrink-0 items-center">
                <Icon
                  aria-hidden
                  className={twMerge(
                    "size-(--spacing-icon-sm)",
                    item.status === "failed" && "text-feedback-error",
                    item.status === "pending" && "text-text-muted",
                    item.status === "sending" && "text-action-primary",
                    item.status === "sent" && "text-feedback-success",
                  )}
                />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="wrap-anywhere">{describeItem(item)}</p>
                {item.status === "sent" && item.unfilledFields.length > 0 && (
                  <p className="wrap-anywhere text-feedback-warning">
                    {(item.unfilledFields.length === 1
                      ? "Campo não preenchido: "
                      : "Campos não preenchidos: ") +
                      item.unfilledFields.join(", ") +
                      "."}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {running && (
        <Button
          loading={cancelling}
          loadingLabel="Cancelando…"
          onClick={onCancel}
          variant="secondary"
        >
          <X aria-hidden />
          Cancelar fila
        </Button>
      )}
    </div>
  );
}

function describeItem(item: QueueItem): string {
  const label = item.unit.label + ": ";

  switch (item.status) {
    case "failed":
      return label + "falhou. " + item.message;
    case "pending":
      return label + "pendente.";
    case "sending":
      return label + "enviando…";
    case "sent":
      return label + "envio " + item.record.id + " disparado.";
  }
}

function describeProgress(queue: SubmissionQueue, cancelling: boolean): string {
  const sent = queue.items.filter(({ status }) => status === "sent").length;
  const total = queue.items.length;
  const count = sent + " de " + total;

  switch (queue.outcome) {
    case "cancelled":
      return "Fila cancelada: " + count + " envios disparados.";
    case "completed":
      return (
        "Fila concluída: " +
        count +
        " envios disparados. Confira os leads no painel com os dados do histórico."
      );
    case "failed":
    case "stopped":
      return "Fila interrompida: " + count + " envios disparados.";
    case undefined: {
      if (cancelling) {
        return "Cancelando: a fila para depois do envio em andamento.";
      }

      const sending = queue.items.findIndex(
        ({ status }) => status === "sending",
      );

      return sending === -1
        ? sent === 0
          ? "Conferindo a página antes do envio 1 de " + total + "…"
          : count + " envios disparados; o próximo começa em instantes."
        : "Enviando " +
            (sending + 1) +
            " de " +
            total +
            ": " +
            (queue.items[sending]?.unit.label ?? "") +
            "…";
    }
  }
}
