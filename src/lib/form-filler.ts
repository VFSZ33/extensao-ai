import type {
  FormDefinition,
  FormFieldDefinition,
} from "@/lib/form-definition";
import type { LeadData } from "@/lib/lead-data";

import {
  type FilledValues,
  type PageResponse,
  parsePageCommand,
  type RecognizedForm,
} from "@/lib/page-command";

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

type ResolvedField =
  | ({ element: FieldElement } & Extract<FormFieldDefinition, { kind: "text" }>)
  | ({ element: HTMLInputElement } & Extract<
      FormFieldDefinition,
      { kind: "checkbox" }
    >);

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export function detectForms(
  document: Document,
  definitions: FormDefinition[],
): RecognizedForm[] {
  return Array.from(document.forms).flatMap((form, index) => {
    const definition = definitions.find((candidate) => candidate.matches(form));

    return definition
      ? [
          {
            definitionId: definition.id,
            definitionName: definition.name,
            index,
            label: describeForm(form),
          },
        ]
      : [];
  });
}

export async function fillAndSubmitForm(
  form: HTMLFormElement,
  definition: FormDefinition,
  lead: LeadData,
): Promise<FilledValues> {
  const fields = resolveFields(form, definition);
  const submitControl = form.querySelector(definition.submitSelector);

  if (!(submitControl instanceof HTMLElement)) {
    throw new Error("Botão de envio da definição não encontrado.");
  }

  for (const field of fields) {
    if (field.kind === "text") {
      setTextValue(field.element, lead[field.source]);
    } else if (!field.element.checked) {
      field.element.click();
    }
  }

  await waitForPageUpdate();

  const values = readFilledValues(fields, lead);
  const unmappedField = findUnmappedRequiredField(form, fields);

  if (unmappedField) {
    throw new Error(
      'O formulário exige o campo "' +
        unmappedField +
        '", que a definição não preenche.',
    );
  }

  if (submitControl.matches(":disabled")) {
    throw new Error("O botão de envio está desabilitado.");
  }

  submitControl.click();

  return values;
}

export async function runPageCommand(
  value: unknown,
  document: Document,
  definitions: FormDefinition[],
): Promise<PageResponse<FilledValues | RecognizedForm[]>> {
  const command = parsePageCommand(value);

  if (!command) {
    return { error: "Comando não suportado.", ok: false };
  }

  if (command.type === "detect-forms") {
    return { ok: true, result: detectForms(document, definitions) };
  }

  const definition = definitions.find(
    (candidate) => candidate.id === command.definitionId,
  );
  const form = document.forms.item(command.index);

  if (!form || !definition?.matches(form)) {
    return {
      error:
        "O formulário escolhido não está mais na página. Atualize a lista.",
      ok: false,
    };
  }

  try {
    return {
      ok: true,
      result: await fillAndSubmitForm(form, definition, command.lead),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível preencher o formulário.",
      ok: false,
    };
  }
}

function describeForm(form: HTMLFormElement): string {
  const ownLabel =
    form.dataset.gtagLabel?.trim() || form.getAttribute("aria-label")?.trim();

  if (ownLabel) {
    return ownLabel;
  }

  for (
    let ancestor = form.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const heading = ancestor.querySelector(HEADING_SELECTOR);
    const text = heading?.textContent?.trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function findUnmappedRequiredField(
  form: HTMLFormElement,
  fields: ResolvedField[],
): string | undefined {
  const mapped = new Set<Element>(fields.map(({ element }) => element));

  for (const element of Array.from(form.elements)) {
    if (
      mapped.has(element) ||
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.required ||
      element.disabled
    ) {
      continue;
    }

    const filled =
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
        ? element.checked
        : element.value.trim() !== "";

    if (!filled) {
      return element.name || element.id || element.tagName.toLowerCase();
    }
  }

  return undefined;
}

function keepDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function readFilledValues(
  fields: ResolvedField[],
  lead: LeadData,
): FilledValues {
  const values: FilledValues = {};

  for (const field of fields) {
    if (field.kind === "checkbox") {
      if (!field.element.checked) {
        throw new Error('A caixa "' + field.key + '" não aceitou a marcação.');
      }

      values[field.key] = true;
      continue;
    }

    const expected = lead[field.source];
    const accepted =
      field.comparison === "digits"
        ? keepDigits(field.element.value) === keepDigits(expected)
        : field.element.value === expected;

    if (!accepted) {
      throw new Error(
        'O campo "' + field.key + '" não aceitou o valor de teste.',
      );
    }

    values[field.key] = field.element.value;
  }

  return values;
}

function resolveFields(
  form: HTMLFormElement,
  definition: FormDefinition,
): ResolvedField[] {
  return definition.fields.flatMap((field): ResolvedField[] => {
    const element = form.querySelector(field.selector);

    if (field.kind === "checkbox") {
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        return [{ ...field, element }];
      }
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return [{ ...field, element }];
    }

    if (!element && field.optional) {
      return [];
    }

    throw new Error(
      'Campo "' + field.key + '" da definição não encontrado no formulário.',
    );
  });
}

function setTextValue(element: FieldElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (!setValue) {
    throw new Error("Não foi possível preencher os campos desta página.");
  }

  setValue.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function waitForPageUpdate(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
