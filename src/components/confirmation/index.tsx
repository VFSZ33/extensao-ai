import { type ReactNode, useEffect, useId, useRef } from "react";
import { twMerge } from "tailwind-merge";

import { Button, type ButtonProps } from "@/components/button";

export type ConfirmationProps = {
  children: ReactNode;
  confirmLabel: ReactNode;
  confirmVariant?: ButtonProps["variant"];
  loading?: boolean;
  loadingLabel?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
  tone?: "critical" | "default";
};

export function Confirmation({
  children,
  confirmLabel,
  confirmVariant = "primary",
  loading = false,
  loadingLabel,
  onCancel,
  onConfirm,
  title,
  tone = "default",
}: ConfirmationProps) {
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={twMerge(
        "flex flex-col gap-3 rounded-(--radius-input) border bg-surface-elevated p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary",
        tone === "critical" && "border-feedback-error",
        tone === "default" && "border-border-emphasis",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !loading) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      ref={ref}
      role="group"
      tabIndex={-1}
    >
      <p className="font-medium" id={titleId}>
        {title}
      </p>
      <div className="flex flex-col gap-2" id={descriptionId}>
        {children}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          loading={loading}
          loadingLabel={loadingLabel}
          onClick={onConfirm}
          variant={confirmVariant}
        >
          {confirmLabel}
        </Button>
        <Button disabled={loading} onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
      </div>
    </div>
  );
}
