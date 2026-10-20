import type {
  FormDefinition,
  FormFieldDefinition,
} from "@/lib/form-definition";
import type { LeadData } from "@/lib/lead-data";

import {
  type FilledValues,
  type FormSelect,
  type PageResponse,
  parsePageCommand,
  type RecognizedForm,
  type SubmissionResult,
} from "@/lib/page-command";

type EmptyField = { element: FieldElement; name: string };

type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type ResolvedField =
  | ({ element: HTMLInputElement } & Extract<
      FormFieldDefinition,
      { kind: "checkbox" }
    >)
  | ({ element: HTMLInputElement | HTMLTextAreaElement } & Extract<
      FormFieldDefinition,
      { kind: "text" }
    >)
  | ({ element: HTMLSelectElement } & Extract<
      FormFieldDefinition,
      { kind: "select" }
    >);

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const NON_FILLABLE_TYPES = ["button", "hidden", "image", "reset", "submit"];
const PAGE_UPDATE_WAIT_MS = 250;

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
            selects: listSelects(form, definition),
          },
        ]
      : [];
  });
}

export async function fillAndSubmitForm(
  form: HTMLFormElement,
  definition: FormDefinition,
  lead: LeadData,
  selections: Record<string, string> = {},
): Promise<SubmissionResult> {
  const fields = resolveFields(form, definition);
  const submitControl = form.querySelector(definition.submitSelector);

  if (!(submitControl instanceof HTMLElement)) {
    throw new Error("Botão de envio da definição não encontrado.");
  }

  checkSelections(fields, selections);

  for (const field of fields) {
    if (field.kind === "text") {
      setFieldValue(field.element, lead[field.source]);
    } else if (field.kind === "select") {
      const selection = selections[field.key];

      if (selection !== undefined) {
        setFieldValue(field.element, selection);
      }
    } else if (!field.element.checked) {
      field.element.click();
    }
  }

  await waitForPageUpdate();

  const values = readFilledValues(fields, lead, selections);
  const emptyFields = listEmptyUnmappedFields(form, fields);
  const requiredConsent = emptyFields.find(
    ({ element }) =>
      element.required &&
      definition.consentSelectors.some((selector) => element.matches(selector)),
  );
  const requiredField = emptyFields.find(({ element }) => element.required);

  if (requiredConsent) {
    throw new Error(
      'O formulário exige o consentimento de marketing "' +
        requiredConsent.name +
        '". Por política, a extensão não marca consentimento, e o formulário não foi enviado.',
    );
  }

  if (requiredField) {
    throw new Error(
      'O formulário exige o campo "' +
        requiredField.name +
        '", que a definição não preenche.',
    );
  }

  if (submitControl.matches(":disabled")) {
    throw new Error("O botão de envio está desabilitado.");
  }

  submitControl.click();

  return {
    unfilledFields: [
      ...new Set(
        emptyFields
          .filter(({ element }) => isVisibleAndEditable(element))
          .map(({ name }) => name),
      ),
    ],
    values,
  };
}

export async function runPageCommand(
  value: unknown,
  document: Document,
  definitions: FormDefinition[],
): Promise<PageResponse<RecognizedForm[] | SubmissionResult>> {
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
      result: await fillAndSubmitForm(
        form,
        definition,
        command.lead,
        command.selections,
      ),
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

function checkSelections(
  fields: ResolvedField[],
  selections: Record<string, string>,
): void {
  for (const [key, selection] of Object.entries(selections)) {
    const field = fields.find(
      (candidate) => candidate.kind === "select" && candidate.key === key,
    );

    if (field?.kind !== "select") {
      throw new Error(
        'O seletor "' +
          key +
          '" não está mais no formulário. Atualize a lista.',
      );
    }

    if (!listOptions(field.element).some(({ value }) => value === selection)) {
      throw new Error(
        'A opção escolhida em "' +
          field.label +
          '" não está mais na página. Atualize a lista.',
      );
    }
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

function isFilled(element: FieldElement, form: HTMLFormElement): boolean {
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    return element.checked;
  }

  if (element instanceof HTMLInputElement && element.type === "radio") {
    return Array.from(form.elements).some(
      (candidate) =>
        candidate instanceof HTMLInputElement &&
        candidate.type === "radio" &&
        candidate.name === element.name &&
        candidate.checked,
    );
  }

  return element.value.trim() !== "";
}

function isVisibleAndEditable(element: FieldElement): boolean {
  return (
    (element instanceof HTMLSelectElement || !element.readOnly) &&
    (typeof element.checkVisibility !== "function" ||
      element.checkVisibility({ visibilityProperty: true }))
  );
}

function keepDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function listEmptyUnmappedFields(
  form: HTMLFormElement,
  fields: ResolvedField[],
): EmptyField[] {
  const mapped = new Set<Element>(fields.map(({ element }) => element));

  return Array.from(form.elements).flatMap((element): EmptyField[] =>
    !mapped.has(element) &&
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    !NON_FILLABLE_TYPES.includes(element.type) &&
    !element.matches(":disabled") &&
    !isFilled(element, form)
      ? [
          {
            element,
            name: element.name || element.id || element.tagName.toLowerCase(),
          },
        ]
      : [],
  );
}

function listOptions(select: HTMLSelectElement): FormSelect["options"] {
  return Array.from(select.options).flatMap((option) =>
    option.disabled || option.value === ""
      ? []
      : [{ label: option.text, value: option.value }],
  );
}

function listSelects(
  form: HTMLFormElement,
  definition: FormDefinition,
): FormSelect[] {
  return definition.fields.flatMap((field): FormSelect[] => {
    if (field.kind !== "select") {
      return [];
    }

    const element = form.querySelector(field.selector);

    return element instanceof HTMLSelectElement
      ? [{ key: field.key, label: field.label, options: listOptions(element) }]
      : [];
  });
}

function readFilledValues(
  fields: ResolvedField[],
  lead: LeadData,
  selections: Record<string, string>,
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

    if (field.kind === "select") {
      const selection = selections[field.key];

      if (selection !== undefined && field.element.value !== selection) {
        throw new Error(
          'O seletor "' + field.label + '" não aceitou a opção escolhida.',
        );
      }

      if (field.element.required && field.element.value === "") {
        throw new Error(
          'O seletor "' + field.label + '" é obrigatório. Escolha uma opção.',
        );
      }

      values[field.key] = {
        label: field.element.selectedOptions.item(0)?.text ?? "",
        value: field.element.value,
      };
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
    } else if (field.kind === "select") {
      if (element instanceof HTMLSelectElement) {
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

function setFieldValue(element: FieldElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (!setValue) {
    throw new Error("Não foi possível preencher os campos desta página.");
  }

  element.dispatchEvent(new FocusEvent("focus"));
  element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  setValue.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur"));
  element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

function waitForPageUpdate(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PAGE_UPDATE_WAIT_MS);
  });
}
