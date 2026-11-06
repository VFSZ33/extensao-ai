import type { RecognizedForm, SelectOption } from "@/lib/page-command";
import type { SubmissionRecord } from "@/lib/submission-history";

import {
  findUnchangedForm,
  type PageForms,
  submitTestLead,
} from "@/lib/page-forms";

export type QueueItem =
  | {
      message: string;
      status: "failed";
      unit: SelectOption;
    }
  | {
      record: SubmissionRecord;
      status: "sent";
      unfilledFields: string[];
      unit: SelectOption;
    }
  | { status: "pending" | "sending"; unit: SelectOption };

export type QueueOutcome = "cancelled" | "completed" | "failed" | "stopped";

export type SubmissionQueue = {
  items: QueueItem[];
  message?: string;
  outcome?: QueueOutcome;
};

export type SubmissionQueueOptions = {
  form: RecognizedForm;
  interval?: number;
  onChange: (queue: SubmissionQueue) => void;
  onSubmitted: (record?: SubmissionRecord) => void;
  page: PageForms;
  selections: Record<string, string>;
  signal: AbortSignal;
  units: SelectOption[];
};

export const QUEUE_SEND_INTERVAL_MS = 2000;

export function findUnitSelect(
  form: RecognizedForm,
): RecognizedForm["selects"][number] | undefined {
  return form.selects.find(({ unit }) => unit === true);
}

export function listPendingUnits(queue: SubmissionQueue): SelectOption[] {
  return queue.items.flatMap(({ status, unit }) =>
    status === "pending" ? [unit] : [],
  );
}

export async function runSubmissionQueue({
  form,
  interval = QUEUE_SEND_INTERVAL_MS,
  onChange,
  onSubmitted,
  page,
  selections,
  signal,
  units,
}: SubmissionQueueOptions): Promise<SubmissionQueue> {
  let queue: SubmissionQueue = {
    items: units.map((unit) => ({ status: "pending", unit })),
  };
  const unitKey = findUnitSelect(form)?.key;

  function update(next: SubmissionQueue): SubmissionQueue {
    queue = next;
    onChange(queue);

    return queue;
  }

  function finish(outcome: QueueOutcome, message?: string): SubmissionQueue {
    return update({
      items: queue.items,
      ...(message !== undefined && { message }),
      outcome,
    });
  }

  function setItem(index: number, item: QueueItem): void {
    update({ items: queue.items.with(index, item) });
  }

  if (unitKey === undefined) {
    return finish(
      "stopped",
      "O formulário não tem seletor de unidade. Atualize a lista.",
    );
  }

  for (const [index, unit] of units.entries()) {
    if (index > 0) {
      await wait(interval, signal);
    }

    if (signal.aborted) {
      return finish("cancelled");
    }

    const current = await findUnchangedForm(page, form);

    if (signal.aborted) {
      return finish("cancelled");
    }

    if (!current) {
      return finish(
        "stopped",
        (index === 0
          ? "A página mudou desde a busca dos formulários"
          : "A página mudou depois do envio anterior") +
          ", e a fila parou antes de " +
          unit.label +
          " para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      );
    }

    if (
      !current.selects.some(
        ({ key, options, unit: isUnit }) =>
          isUnit === true &&
          key === unitKey &&
          options.some(({ value }) => value === unit.value),
      )
    ) {
      return finish(
        "stopped",
        "A unidade " +
          unit.label +
          " não está mais no seletor da página, e a fila parou. Atualize a lista para enviar às unidades pendentes.",
      );
    }

    setItem(index, { status: "sending", unit });

    try {
      const { record, unfilledFields } = await submitTestLead(
        page,
        form,
        { ...selections, [unitKey]: unit.value },
        page.documentId,
      );
      setItem(index, { record, status: "sent", unfilledFields, unit });
      onSubmitted(record);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível enviar o formulário.";
      setItem(index, { message, status: "failed", unit });
      onSubmitted();

      return finish(
        "failed",
        "O envio para " +
          unit.label +
          " falhou, e a fila parou para não seguir com a página num estado desconhecido.",
      );
    }
  }

  return finish("completed");
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });

    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
