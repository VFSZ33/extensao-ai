import { panelReport } from "@tests/fixtures/panel";
import { describe, expect, it } from "vitest";

import type { LeadIntegrationReport } from "@/lib/integration-status";

import {
  AUTO_REFRESH_INTERVAL_MS,
  isSameReport,
  readRefreshDelay,
} from "@/lib/auto-refresh";

const report = panelReport as LeadIntegrationReport;

describe("Atualização automática", () => {
  it("agenda a próxima consulta 30 s depois da última", () => {
    expect(AUTO_REFRESH_INTERVAL_MS).toBe(30000);
    expect(readRefreshDelay(1000, 1000)).toBe(30000);
    expect(readRefreshDelay(1000, 21000)).toBe(10000);
  });

  it("consulta logo quando a última já passou do intervalo, como ao voltar a ficar visível", () => {
    expect(readRefreshDelay(1000, 31000)).toBe(0);
    expect(readRefreshDelay(1000, 500000)).toBe(0);
    expect(readRefreshDelay(Number.NaN, 1000)).toBe(0);
  });

  it("nunca espera mais que o intervalo, mesmo com relógio adiantado", () => {
    expect(readRefreshDelay(90000, 1000)).toBe(30000);
    expect(readRefreshDelay(0, 0, 15000)).toBe(15000);
  });

  it("compara o resultado para só trocar o que mudou", () => {
    expect(isSameReport(report, structuredClone(report))).toBe(true);
    expect(
      isSameReport(report, {
        ...report,
        leads: report.leads.map((lead, index) =>
          index === 2 ? { ...lead, status: "ok" } : lead,
        ),
      }),
    ).toBe(false);
  });
});
