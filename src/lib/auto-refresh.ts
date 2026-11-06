import type { LeadIntegrationReport } from "@/lib/integration-status";

export const AUTO_REFRESH_INTERVAL_MS = 30000;

export function isSameReport(
  first: LeadIntegrationReport,
  second: LeadIntegrationReport,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function readRefreshDelay(
  lastRunAt: number,
  now: number,
  interval = AUTO_REFRESH_INTERVAL_MS,
): number {
  return Number.isFinite(lastRunAt)
    ? Math.min(interval, Math.max(0, lastRunAt + interval - now))
    : 0;
}
