import { act, renderHook } from "@testing-library/react";
import { panelReport } from "@tests/fixtures/panel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VerifiedLead } from "@/lib/integration-status";

import { useSubmissionTracking } from "@/hooks/use-submission-tracking";
import {
  checkSubmissionInPanel,
  type SubmissionCheck,
} from "@/lib/submission-tracking";

vi.mock(import("@/lib/submission-tracking"), async (importOriginal) => ({
  ...(await importOriginal()),
  checkSubmissionInPanel: vi.fn(),
}));

const SUBMISSION_ID = "LT-20261008-141748-012";
const check = vi.mocked(checkSubmissionInPanel);
const lead = panelReport.leads[0] as VerifiedLead;

async function advance(milliseconds: number) {
  await act(() => vi.advanceTimersByTimeAsync(milliseconds));
}

function found(status: VerifiedLead["status"]): SubmissionCheck {
  return { lead: { ...lead, status }, status: "found" };
}

describe("Acompanhamento dos envios", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 19, 15, 30, 0) });
    check.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consulta logo depois do envio e repete a cada 15 s enquanto o lead está pendente", async () => {
    check
      .mockResolvedValueOnce({ status: "not-found" })
      .mockResolvedValueOnce(found("pending"))
      .mockResolvedValueOnce(found("ok"));
    const { result } = renderHook(() => useSubmissionTracking(true, true));
    act(() => result.current.track(SUBMISSION_ID));
    await advance(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(SUBMISSION_ID);
    expect(result.current.trackings.get(SUBMISSION_ID)).toMatchObject({
      check: { status: "not-found" },
      checkedAt: new Date(2026, 9, 19, 15, 30, 0).toISOString(),
      running: false,
    });
    await advance(14999);
    expect(check).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.trackings.get(SUBMISSION_ID)?.check).toEqual(
      found("pending"),
    );
    await advance(15000);
    expect(check).toHaveBeenCalledTimes(3);
    expect(result.current.trackings.get(SUBMISSION_ID)).toMatchObject({
      check: found("ok"),
      expired: false,
      nextAt: undefined,
    });
    await advance(60000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("para depois de 5 min sem resultado conclusivo", async () => {
    check.mockResolvedValue(found("no-events"));
    const { result } = renderHook(() => useSubmissionTracking(true, true));
    act(() => result.current.track(SUBMISSION_ID));

    for (let elapsed = 0; elapsed <= 300000; elapsed += 15000) {
      await advance(elapsed === 0 ? 0 : 15000);
    }

    expect(check).toHaveBeenCalledTimes(20);
    expect(result.current.trackings.get(SUBMISSION_ID)).toMatchObject({
      expired: true,
      nextAt: undefined,
    });
    await advance(60000);
    expect(check).toHaveBeenCalledTimes(20);
  });

  it("não repete sem painel aberto, sem acesso ou com erro", async () => {
    check
      .mockResolvedValueOnce({ status: "no-panel" })
      .mockResolvedValueOnce({ status: "no-access" });
    const { result } = renderHook(() => useSubmissionTracking(true, true));
    act(() => result.current.track(SUBMISSION_ID));
    act(() => result.current.track("LT-20261008-141748-013"));
    await advance(60000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(
      [...result.current.trackings.values()].map(({ check, expired }) => [
        check?.status,
        expired,
      ]),
    ).toEqual([
      ["no-panel", false],
      ["no-access", false],
    ]);
  });

  it("pausa enquanto a interface está fora de vista ou a opção está desativada e retoma no prazo", async () => {
    check.mockResolvedValue(found("pending"));
    const { rerender, result } = renderHook(
      ({ enabled, visible }) => useSubmissionTracking(enabled, visible),
      { initialProps: { enabled: true, visible: true } },
    );
    act(() => result.current.track(SUBMISSION_ID));
    await advance(0);
    expect(check).toHaveBeenCalledTimes(1);
    rerender({ enabled: true, visible: false });
    await advance(45000);
    expect(check).toHaveBeenCalledTimes(1);
    rerender({ enabled: true, visible: true });
    await advance(0);
    expect(check).toHaveBeenCalledTimes(2);
    rerender({ enabled: false, visible: true });
    await advance(45000);
    expect(check).toHaveBeenCalledTimes(2);
    rerender({ enabled: true, visible: true });
    await advance(0);
    expect(check).toHaveBeenCalledTimes(3);
    rerender({ enabled: false, visible: true });
    await advance(300000);
    rerender({ enabled: true, visible: true });
    await advance(0);
    expect(check).toHaveBeenCalledTimes(3);
    expect(result.current.trackings.get(SUBMISSION_ID)?.expired).toBe(true);
  });

  it("nunca consulta o mesmo envio duas vezes ao mesmo tempo", async () => {
    let finish: (value: SubmissionCheck) => void = () => {};
    check.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useSubmissionTracking(true, true));
    act(() => result.current.track(SUBMISSION_ID));
    await advance(60000);
    expect(check).toHaveBeenCalledTimes(1);
    expect(result.current.trackings.get(SUBMISSION_ID)?.running).toBe(true);
    await act(async () => {
      finish(found("pending"));
    });
    expect(result.current.trackings.get(SUBMISSION_ID)?.running).toBe(false);
    await advance(15000);
    expect(check).toHaveBeenCalledTimes(2);
  });
});
