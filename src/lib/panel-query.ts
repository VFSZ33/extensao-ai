import { isRecord } from "@/lib/is-record";

export type LeadLimit = (typeof LEAD_LIMITS)[number];

export type PanelQuery = { limit: LeadLimit; search: string };

export const DEFAULT_LEAD_LIMIT: LeadLimit = 10;
export const LEAD_LIMITS = [5, 10, 20] as const;
export const PANEL_QUERY_KEY = "leadIntegrationTesterPanelQuery";
export const SEARCH_MAX_LENGTH = 100;

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

export function isLeadLimit(value: unknown): value is LeadLimit {
  return LEAD_LIMITS.some((limit) => limit === value);
}

export function parsePanelQuery(value: unknown): PanelQuery | undefined {
  if (
    !isRecord(value) ||
    !isLeadLimit(value.limit) ||
    typeof value.search !== "string"
  ) {
    return undefined;
  }

  const search = value.search.trim();

  return search.length > SEARCH_MAX_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(search)
    ? undefined
    : { limit: value.limit, search };
}
