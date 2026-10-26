import type { LeadData } from "@/lib/lead-data";

export type FormDefinition = {
  fields: FormFieldDefinition[];
  id: string;
  matches: (form: HTMLFormElement) => boolean;
  name: string;
  submitSelector: string;
};

export type FormFieldDefinition = (
  | { comparison: "digits" | "exact"; kind: "text"; source: keyof LeadData }
  | { kind: "checkbox" }
  | { kind: "select"; label: string }
) & {
  key: string;
  optional?: boolean;
  selector: string;
};
