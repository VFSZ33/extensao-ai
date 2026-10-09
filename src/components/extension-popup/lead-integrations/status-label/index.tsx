import type { ReactNode } from "react";

import {
  CircleCheck,
  CircleDashed,
  CircleQuestionMark,
  CircleX,
  Clock,
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import type { LeadStatus } from "@/lib/integration-status";

export type StatusLabelProps = { children: ReactNode; status: LeadStatus };

const STATUS_ICONS = {
  error: CircleX,
  "no-events": CircleDashed,
  ok: CircleCheck,
  pending: Clock,
  unavailable: CircleQuestionMark,
};

export function StatusLabel({ children, status }: StatusLabelProps) {
  const Icon = STATUS_ICONS[status];

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="flex h-5 shrink-0 items-center">
        <Icon
          aria-hidden
          className={twMerge(
            "size-(--spacing-icon-sm)",
            status === "error" && "text-feedback-error",
            status === "no-events" && "text-text-muted",
            status === "ok" && "text-feedback-success",
            status === "pending" && "text-feedback-warning",
            status === "unavailable" && "text-text-secondary",
          )}
        />
      </span>
      <p className="min-w-0 wrap-anywhere">{children}</p>
    </div>
  );
}
