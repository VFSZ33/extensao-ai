import type { LeadTextSource } from "@/lib/lead-data";

export type FormDefinition = {
  fields: FormFieldDefinition[];
  id: string;
  marks?: string[];
  matches: (form: HTMLFormElement) => boolean;
  name: string;
  submitSelector: string;
};

export type FormFieldDefinition = (
  | { comparison: "digits" | "exact"; kind: "text"; source: LeadTextSource }
  | { kind: "checkbox" }
  | { kind: "file"; uploadedSelector?: string }
  | { kind: "select"; label: string; unit?: boolean }
) & {
  key: string;
  optional?: boolean;
  selector: string;
};
