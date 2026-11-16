import type {
  FormReturn,
  RecognizedForm,
  SelectOption,
} from "@/lib/page-command";
import type { SubmissionRecord } from "@/lib/submission-history";

import {
  FORM_RETURN_TIMEOUT_MS,
  SUBMISSION_SETTLE_TIMEOUT_MS,
} from "@/lib/form-return";
import {
  findUnchangedForm,
  type FormCheck,
  type FormReopen,
  PAGE_LOAD_TIMEOUT_MS,
  type PageForms,
  reopenFormPage,
  returnToForm,
  submitTestLead,
  waitForPageChange,
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
  redirectWatch?: number;
  selections: Record<string, string>;
  signal: AbortSignal;
  units: SelectOption[];
};

export const QUEUE_REDIRECT_TIMEOUT_MS = 15000;
export const QUEUE_REDIRECT_WATCH_MS = 5000;
export const QUEUE_REOPEN_LIMIT = 3;
export const QUEUE_SEND_INTERVAL_MS = 2000;

const CHECK_STOPS: Record<Exclude<FormCheck["status"], "found">, string> = {
  inaccessible:
    "A página foi recarregada ou deixou de estar acessível depois do envio anterior",
  inactive:
    "A aba foi fechada ou deixou de ser a ativa depois do envio anterior",
  missing: "O formulário saiu da página depois do envio anterior",
  moved: "A página mudou de endereço depois do envio anterior",
  navigating: "A página continuou mudando de endereço depois do envio anterior",
};
const NAVIGATION_CHECKS = new Set<FormCheck["status"]>([
  "inaccessible",
  "moved",
  "navigating",
]);
const REDIRECT_TIMEOUT_STOP =
  "A página não foi para a página de obrigado em " +
  String(QUEUE_REDIRECT_TIMEOUT_MS / 1000) +
  " s depois do envio anterior, como nos envios anteriores";
const REOPEN_STOPS: Record<
  Exclude<FormReopen["status"], "cancelled" | "denied" | "found">,
  string
> = {
  ambiguous:
    "O formulário apareceu em outra posição ou repetido depois que a extensão voltou ao endereço dele",
  inaccessible:
    "A página deixou de estar acessível depois que a extensão voltou ao endereço do formulário",
  inactive: CHECK_STOPS.inactive,
  missing:
    "O formulário não apareceu depois que a extensão voltou ao endereço dele",
  "other-site": "A página foi para outro site depois do envio anterior",
  timeout:
    "A página do formulário não terminou de carregar em " +
    String(PAGE_LOAD_TIMEOUT_MS / 1000) +
    " s",
};
const RETURN_BUTTON_LABEL = '"Voltar para o formulário"';
const RETURN_STOPS: Record<
  Exclude<FormReturn, "form-present" | "returned" | "unknown-form">,
  string
> = {
  "ambiguous-button":
    "Há mais de um botão " +
    RETURN_BUTTON_LABEL +
    " onde estava o formulário enviado",
  "ambiguous-form":
    "Mais de um formulário apareceu depois do clique em " + RETURN_BUTTON_LABEL,
  busy:
    "O site não terminou o envio anterior em " +
    String(SUBMISSION_SETTLE_TIMEOUT_MS / 1000) +
    " s",
  "missing-button":
    "O formulário saiu da página depois do envio anterior, sem o botão " +
    RETURN_BUTTON_LABEL +
    " no lugar dele",
  "missing-region":
    "O formulário saiu da página depois do envio anterior, junto com a área onde ele estava",
  timeout:
    "O formulário não voltou em " +
    String(FORM_RETURN_TIMEOUT_MS / 1000) +
    " s depois do clique em " +
    RETURN_BUTTON_LABEL,
};

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
  page: initialPage,
  redirectWatch = QUEUE_REDIRECT_WATCH_MS,
  selections,
  signal,
  units,
}: SubmissionQueueOptions): Promise<SubmissionQueue> {
  let page = initialPage;
  let queue: SubmissionQueue = {
    items: units.map((unit) => ({ status: "pending", unit })),
  };
  let redirects: boolean | undefined;
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

    let check = await findUnchangedForm(page, form, signal);

    if (signal.aborted) {
      return finish("cancelled");
    }

    function stop(reason: string): SubmissionQueue {
      return finish(
        "stopped",
        reason +
          ", e a fila parou antes de " +
          unit.label +
          " para não enviar no lugar errado. Atualize a lista para enviar às unidades pendentes.",
      );
    }

    if (index === 0 && check.status !== "found") {
      return stop("A página mudou desde a busca dos formulários");
    }

    let formReturn: FormReturn | undefined;
    let left = false;
    const submittedDocumentId = page.documentId;

    if (index > 0 && (check.status === "found" || check.status === "missing")) {
      formReturn = await returnToForm(page, form, signal).catch(
        () => undefined,
      );

      if (signal.aborted) {
        return finish("cancelled");
      }

      if (isStopReturn(formReturn)) {
        return stop(RETURN_STOPS[formReturn]);
      }

      check = await findUnchangedForm(page, form, signal);

      if (signal.aborted) {
        return finish("cancelled");
      }

      if (check.status === "missing") {
        return stop(
          formReturn === "returned"
            ? "O formulário que voltou depois do clique em " +
                RETURN_BUTTON_LABEL +
                " não é o mesmo do envio anterior"
            : formReturn === "form-present"
              ? "O formulário mudou depois do envio anterior"
              : CHECK_STOPS.missing,
        );
      }
    }

    for (let reopens = 0; index > 0;) {
      if (NAVIGATION_CHECKS.has(check.status)) {
        if (check.status === "moved") {
          left = true;
        }

        if (reopens === QUEUE_REOPEN_LIMIT) {
          break;
        }

        reopens += 1;
        const reopened = await reopenFormPage(page, form, signal);

        if (signal.aborted || reopened.status === "cancelled") {
          return finish("cancelled");
        }

        if (reopened.status === "denied") {
          return finish(
            "stopped",
            "A extensão perdeu o acesso à página depois que ela mudou de endereço, e a fila parou antes de " +
              unit.label +
              '. Libere o acesso ao site em "Permitir acesso a este site", no painel lateral (o acesso temporário do clique no ícone pode acabar quando a aba muda de endereço), e atualize a lista para enviar às unidades pendentes.',
          );
        }

        if (reopened.status !== "found") {
          return stop(REOPEN_STOPS[reopened.status]);
        }

        page = reopened.page;
        await wait(interval, signal);

        if (signal.aborted) {
          return finish("cancelled");
        }

        check = await findUnchangedForm(page, form, signal);

        if (signal.aborted) {
          return finish("cancelled");
        }

        continue;
      }

      if (
        check.status !== "found" ||
        formReturn === "returned" ||
        left ||
        page.documentId !== submittedDocumentId ||
        redirects === false
      ) {
        break;
      }

      const change = await waitForPageChange(
        page,
        redirects ? QUEUE_REDIRECT_TIMEOUT_MS : redirectWatch,
        signal,
      );

      if (signal.aborted || change === "cancelled") {
        return finish("cancelled");
      }

      if (change === "inactive") {
        return stop(CHECK_STOPS.inactive);
      }

      if (change === "unchanged") {
        if (redirects) {
          return stop(REDIRECT_TIMEOUT_STOP);
        }

        redirects = false;
        break;
      }

      check = await findUnchangedForm(page, form, signal);

      if (signal.aborted) {
        return finish("cancelled");
      }

      if (check.status === "found" || check.status === "missing") {
        check = { status: "navigating" };
      }
    }

    if (check.status !== "found") {
      return stop(CHECK_STOPS[check.status]);
    }

    if (index > 0 && (left || page.documentId !== submittedDocumentId)) {
      redirects = true;
    }

    const current = check.form;

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

function isStopReturn(
  formReturn: FormReturn | undefined,
): formReturn is keyof typeof RETURN_STOPS {
  return formReturn !== undefined && formReturn in RETURN_STOPS;
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
