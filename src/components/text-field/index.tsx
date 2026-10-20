import { Field } from "@base-ui/react/field";
import { type ComponentProps, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type TextFieldProps = {
  label: ReactNode;
} & Omit<ComponentProps<typeof Field.Control>, "children">;

export function TextField({
  className,
  disabled = false,
  label,
  ...props
}: TextFieldProps) {
  return (
    <Field.Root className="flex min-w-0 flex-col gap-1" disabled={disabled}>
      <Field.Label className="control-label text-text-secondary">
        {label}
      </Field.Label>
      <Field.Control
        {...props}
        className={(state) =>
          twMerge(
            "control-label h-(--spacing-control-default) min-w-0 rounded-(--radius-input) border border-border-emphasis bg-surface-elevated px-(--spacing-padding-button-inline) text-text-primary transition-colors duration-(--transition-duration-control) ease-(--ease-standard) placeholder:text-text-muted not-data-[disabled]:hover:border-border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary data-[disabled]:cursor-not-allowed data-[disabled]:border-dashed data-[disabled]:text-text-muted motion-reduce:transition-none",
            typeof className === "function" ? className(state) : className,
          )
        }
      />
    </Field.Root>
  );
}
