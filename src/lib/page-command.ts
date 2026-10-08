import type { LeadData } from "@/lib/lead-data";

export type FilledValues = Record<string, boolean | string>;

export type PageCommand =
  | { definitionId: string; index: number; lead: LeadData; type: "submit-form" }
  | { type: "detect-forms" };

export type PageResponse<Result> =
  { error: string; ok: false } | { ok: true; result: Result };

export type RecognizedForm = {
  definitionId: string;
  definitionName: string;
  index: number;
  label: string;
};

export const PAGE_COMMAND_KEY = "leadIntegrationTesterPageCommand";

const LEAD_KEYS = ["cpf", "email", "message", "name", "phone"] as const;

export function isFilledValues(value: unknown): value is FilledValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "boolean" || typeof entry === "string",
    )
  );
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
        typeof form.label === "string",
    )
  );
}

export function parsePageCommand(value: unknown): PageCommand | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "detect-forms") {
    return { type: "detect-forms" };
  }

  const { definitionId, index, lead } = value;

  if (
    value.type !== "submit-form" ||
    typeof definitionId !== "string" ||
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    !isLeadData(lead)
  ) {
    return undefined;
  }

  return { definitionId, index, lead, type: "submit-form" };
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

function isLeadData(value: unknown): value is LeadData {
  return (
    isRecord(value) && LEAD_KEYS.every((key) => typeof value[key] === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
