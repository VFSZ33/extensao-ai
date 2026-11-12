import type { FormDefinition } from "@/lib/form-definition";
import type { FormReturn } from "@/lib/page-command";

import { isRecord } from "@/lib/is-record";

export type SubmittedForm = {
  definitionId: string;
  form: HTMLFormElement;
  index: number;
  region: Element | null;
};

export const FORM_RETURN_BUTTON_TEXT = "voltar para o formulário";
export const FORM_RETURN_POLL_MS = 250;
export const FORM_RETURN_TIMEOUT_MS = 5000;
export const SUBMISSION_SETTLE_TIMEOUT_MS = 15000;
export const SUBMISSION_UNLOAD_GRACE_MS = 1000;
export const SUBMITTED_FORM_KEY = "leadIntegrationTesterSubmittedForm";

export function rememberSubmittedForm(submitted: SubmittedForm): void {
  Reflect.set(globalThis, SUBMITTED_FORM_KEY, submitted);
}

export async function returnToSubmittedForm(
  document: Document,
  definition: FormDefinition,
  index: number,
): Promise<FormReturn> {
  const submitted = readSubmittedForm(document, definition.id, index);

  if (!submitted) {
    return "unknown-form";
  }

  const { form, region } = submitted;
  const submitting = form.isConnected && isSubmitting(form, definition);

  if (
    !(await waitUntil(
      () => !form.isConnected || !isSubmitting(form, definition),
      SUBMISSION_SETTLE_TIMEOUT_MS,
    ))
  ) {
    return "busy";
  }

  if (submitting && form.isConnected) {
    await wait(SUBMISSION_UNLOAD_GRACE_MS);
  }

  if (form.isConnected) {
    return "form-present";
  }

  if (
    !region?.isConnected ||
    region === document.body ||
    region === document.documentElement
  ) {
    return "missing-region";
  }

  let buttons: HTMLButtonElement[] = [];
  await waitUntil(() => {
    buttons = findReturnButtons(region);

    return buttons.length > 0;
  }, FORM_RETURN_TIMEOUT_MS);
  const [button] = buttons;

  if (!button) {
    return "missing-button";
  }

  if (buttons.length > 1) {
    return "ambiguous-button";
  }

  const previousForms = new Set(region.querySelectorAll("form"));
  let returned: HTMLFormElement[] = [];
  button.click();
  await waitUntil(() => {
    returned = Array.from(region.querySelectorAll("form")).filter(
      (candidate) =>
        !previousForms.has(candidate) && definition.matches(candidate),
    );

    return returned.length > 0;
  }, FORM_RETURN_TIMEOUT_MS);

  return returned.length === 0
    ? "timeout"
    : returned.length === 1
      ? "returned"
      : "ambiguous-form";
}

function findReturnButtons(region: Element): HTMLButtonElement[] {
  return Array.from(region.querySelectorAll('button[type="button"]')).filter(
    (button): button is HTMLButtonElement =>
      button instanceof HTMLButtonElement &&
      !button.disabled &&
      normalizeText(button.textContent) === FORM_RETURN_BUTTON_TEXT,
  );
}

function isSubmitting(form: HTMLFormElement, definition: FormDefinition) {
  const submit = form.querySelector(definition.submitSelector);

  return submit instanceof HTMLElement && submit.matches(":disabled");
}

function normalizeText(text: null | string): string {
  return (text ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function readSubmittedForm(
  document: Document,
  definitionId: string,
  index: number,
): SubmittedForm | undefined {
  const submitted: unknown = Reflect.get(globalThis, SUBMITTED_FORM_KEY);

  return isRecord(submitted) &&
    submitted.definitionId === definitionId &&
    submitted.index === index &&
    submitted.form instanceof HTMLFormElement &&
    submitted.form.ownerDocument === document &&
    (submitted.region === null || submitted.region instanceof Element)
    ? {
        definitionId,
        form: submitted.form,
        index,
        region: submitted.region,
      }
    : undefined;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitUntil(
  condition: () => boolean,
  timeout: number,
): Promise<boolean> {
  for (let waited = 0; !condition(); waited += FORM_RETURN_POLL_MS) {
    if (waited >= timeout) {
      return false;
    }

    await wait(FORM_RETURN_POLL_MS);
  }

  return true;
}
