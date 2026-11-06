import { useCallback, useEffect, useEffectEvent, useState } from "react";

import {
  checkSubmissionInPanel,
  isTrackingExpired,
  readNextCheck,
  type SubmissionCheck,
} from "@/lib/submission-tracking";

export type SubmissionTracking = {
  check: SubmissionCheck | undefined;
  checkedAt: string | undefined;
  expired: boolean;
  nextAt: number | undefined;
  running: boolean;
  startedAt: number;
};

export type SubmissionTrackings = {
  track: (submissionId: string) => void;
  trackings: ReadonlyMap<string, SubmissionTracking>;
};

export function useSubmissionTracking(
  enabled: boolean,
  visible: boolean,
): SubmissionTrackings {
  const [trackings, setTrackings] = useState<
    ReadonlyMap<string, SubmissionTracking>
  >(new Map());

  const track = useCallback((submissionId: string) => {
    const now = Date.now();
    setTrackings((current) =>
      new Map(current).set(submissionId, {
        check: undefined,
        checkedAt: undefined,
        expired: false,
        nextAt: now,
        running: false,
        startedAt: now,
      }),
    );
  }, []);

  const runDue = useEffectEvent(async () => {
    const now = Date.now();
    const due = [...trackings].filter(
      ([, tracking]) =>
        !tracking.running &&
        tracking.nextAt !== undefined &&
        tracking.nextAt <= now,
    );

    if (due.length === 0) {
      return;
    }

    setTrackings((current) => {
      const next = new Map(current);

      for (const [id, tracking] of due) {
        next.set(
          id,
          isTrackingExpired(tracking.startedAt, now)
            ? { ...tracking, expired: true, nextAt: undefined }
            : { ...tracking, running: true },
        );
      }

      return next;
    });

    for (const [id, tracking] of due) {
      if (isTrackingExpired(tracking.startedAt, now)) {
        continue;
      }

      const check = await checkSubmissionInPanel(id);
      const checkedAt = Date.now();

      setTrackings((current) => {
        const entry = current.get(id);

        if (!entry) {
          return current;
        }

        const nextAt = readNextCheck(check, entry.startedAt, checkedAt);

        return new Map(current).set(id, {
          ...entry,
          check,
          checkedAt: new Date(checkedAt).toISOString(),
          expired:
            nextAt === undefined &&
            readNextCheck(check, checkedAt, checkedAt) !== undefined,
          nextAt,
          running: false,
        });
      });
    }
  });

  useEffect(() => {
    if (!enabled || !visible) {
      return;
    }

    const pending = [...trackings.values()].flatMap(({ nextAt, running }) =>
      running || nextAt === undefined ? [] : [nextAt],
    );

    if (pending.length === 0) {
      return;
    }

    const timer = setTimeout(
      () => {
        void runDue();
      },
      Math.max(0, Math.min(...pending) - Date.now()),
    );

    return () => {
      clearTimeout(timer);
    };
  }, [enabled, trackings, visible]);

  return { track, trackings };
}
