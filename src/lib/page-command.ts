import type { LeadAttachment, LeadData } from "@/lib/lead-data";

import { isRecord } from "@/lib/is-record";

export type FilledValues = Record<string, boolean | SelectOption | string>;

export type FormReturn = (typeof FORM_RETURNS)[number];

export type FormSelect = {
  key: string;
  label: string;
  options: SelectOption[];
  unit?: boolean;
};

export type PageCommand =
  | {
      definitionId: string;
      index: number;
      lead: LeadData;
      selections: Record<string, string>;
      type: "submit-form";
    }
  | { definitionId: string; index: number; type: "return-to-form" }
  | { type: "detect-forms" };

export type PageResponse<Result> =
  { error: string; ok: false } | { ok: true; result: Result };

export type RecognizedForm = {
  definitionId: string;
  definitionName: string;
  index: number;
  label: string;
  marks: Record<string, string>;
  selects: FormSelect[];
};

export type SelectOption = { label: string; value: string };

export type SubmissionResult = {
  unfilledFields: string[];
  values: FilledValues;
};

export const FORM_RETURNS = [
  "ambiguous-button",
  "ambiguous-form",
  "busy",
  "form-present",
  "missing-button",
  "missing-region",
  "returned",
  "timeout",
  "unknown-form",
] as const;
export const PAGE_COMMAND_KEY = "leadIntegrationTesterPageCommand";

const LEAD_KEYS = ["cpf", "email", "message", "name", "phone"] as const;

export function isFilledValues(value: unknown): value is FilledValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) =>
        typeof entry === "boolean" ||
        typeof entry === "string" ||
        isSelectOption(entry),
    )
  );
}

export function isFormReturn(value: unknown): value is FormReturn {
  return FORM_RETURNS.some((formReturn) => formReturn === value);
}

export function isRecognizedForms(value: unknown): value is RecognizedForm[] {
  return (
    Array.isArray(value) &&
    value.every(
      (form) =>
        isRecord(form) &&
        typeof form.definitionId === "string" &&
        typeof form.definitionName === "string" &&
        Number.isInteger(form.index) &&
        typeof form.label === "string" &&
        isStringRecord(form.marks) &&
        Array.isArray(form.selects) &&
        form.selects.every(isFormSelect),
    )
  );
}

export function isSelectOption(value: unknown): value is SelectOption {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.value === "string"
  );
}

export function isSubmissionResult(value: unknown): value is SubmissionResult {
  return (
    isRecord(value) &&
    Array.isArray(value.unfilledFields) &&
    value.unfilledFields.every((field) => typeof field === "string") &&
    isFilledValues(value.values)
  );
}

export function parsePageCommand(value: unknown): PageCommand | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "detect-forms") {
    return { type: "detect-forms" };
  }

  const { definitionId, index, lead, selections = {} } = value;

  if (
    typeof definitionId !== "string" ||
    typeof index !== "number" ||
    !Number.isInteger(index)
  ) {
    return undefined;
  }

  if (value.type === "return-to-form") {
    return { definitionId, index, type: "return-to-form" };
  }

  if (
    value.type !== "submit-form" ||
    !isLeadData(lead) ||
    !isStringRecord(selections)
  ) {
    return undefined;
  }

  return { definitionId, index, lead, selections, type: "submit-form" };
}

export function parsePageResponse<Result>(
  value: unknown,
  isResult: (result: unknown) => result is Result,
): PageResponse<Result> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.ok === false && typeof value.error === "string") {
    return { error: value.error, ok: false };
  }

  if (value.ok === true && isResult(value.result)) {
    return { ok: true, result: value.result };
  }

  return undefined;
}

function isFormSelect(value: unknown): value is FormSelect {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    Array.isArray(value.options) &&
    value.options.every(isSelectOption) &&
    (value.unit === undefined || typeof value.unit === "boolean")
  );
}

function isLeadAttachment(value: unknown): value is LeadAttachment {
  return (
    isRecord(value) &&
    typeof value.content === "string" &&
    typeof value.name === "string" &&
    value.type === "application/pdf"
  );
}

function isLeadData(value: unknown): value is LeadData {
  return (
    isRecord(value) &&
    isLeadAttachment(value.attachment) &&
    LEAD_KEYS.every((key) => typeof value[key] === "string")
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
