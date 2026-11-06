import { browser } from "wxt/browser";

import type { ActiveTab } from "@/lib/active-tab";
import type { VerifiedLead } from "@/lib/integration-status";

import { findSubmissionId } from "@/lib/lead-data";
import { readPageAccess } from "@/lib/page-access";
import { verifyPanelLeads } from "@/lib/panel-leads";
import { PANEL_ORIGIN, readPanelAccountId } from "@/lib/panel-session";

export type SubmissionCheck =
  | { lead: VerifiedLead; status: "found" }
  | { message: string; status: "error" }
  | { status: "no-access" | "no-panel" | "not-found" };

export const TRACKING_DURATION_MS = 300000;
export const TRACKING_INTERVAL_MS = 15000;
export const TRACKING_LEAD_LIMIT = 5;

const RETRY_STATUSES: SubmissionCheck["status"][] = ["found", "not-found"];
const WAITING_LEAD_STATUSES: VerifiedLead["status"][] = [
  "no-events",
  "pending",
];

export async function checkSubmissionInPanel(
  submissionId: string,
): Promise<SubmissionCheck> {
  const tab = await findPanelTab();

  if (!tab) {
    return { status: "no-panel" };
  }

  if ((await readPageAccess(tab.id, tab.url)) !== "granted") {
    return { status: "no-access" };
  }

  try {
    const { leads } = await verifyPanelLeads(
      { limit: TRACKING_LEAD_LIMIT, search: submissionId },
      tab,
    );
    const lead = leads.find(
      ({ email, name }) =>
        findSubmissionId(name) === submissionId ||
        findSubmissionId(email) === submissionId,
    );

    return lead ? { lead, status: "found" } : { status: "not-found" };
  } catch (error) {
    return {
      message:
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível consultar o painel.",
      status: "error",
    };
  }
}

export async function findPanelTab(): Promise<ActiveTab | undefined> {
  try {
    const tabs = await browser.tabs.query({ url: PANEL_ORIGIN + "/*" });
    const [tab] = tabs
      .filter(
        ({ discarded, id, url }) =>
          id !== undefined &&
          !discarded &&
          readPanelAccountId(url ?? "") !== undefined,
      )
      .sort(
        (first, second) =>
          (second.lastAccessed ?? 0) - (first.lastAccessed ?? 0),
      );

    return tab?.id === undefined
      ? undefined
      : { id: tab.id, url: tab.url ?? "" };
  } catch {
    return undefined;
  }
}

export function isTrackingExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= TRACKING_DURATION_MS;
}

export function readNextCheck(
  check: SubmissionCheck,
  startedAt: number,
  now: number,
): number | undefined {
  const waiting =
    RETRY_STATUSES.includes(check.status) &&
    (check.status !== "found" ||
      WAITING_LEAD_STATUSES.includes(check.lead.status));
  const next = now + TRACKING_INTERVAL_MS;

  return waiting && !isTrackingExpired(startedAt, next) ? next : undefined;
}
