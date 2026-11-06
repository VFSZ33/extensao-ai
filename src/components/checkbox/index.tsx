import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { type ComponentProps, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type CheckboxProps = {
  label: ReactNode;
} & Omit<ComponentProps<typeof BaseCheckbox.Root>, "children">;

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className="control-label flex min-w-0 cursor-pointer items-center gap-3 text-text-primary has-data-[disabled]:cursor-not-allowed has-data-[disabled]:text-text-muted">
      <BaseCheckbox.Root
        {...props}
        className={(state) =>
          twMerge(
            "flex size-5 shrink-0 items-center justify-center rounded-(--radius-input) border border-border-control bg-surface-elevated text-action-on-primary transition-colors duration-(--transition-duration-control) ease-(--ease-standard) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary data-[checked]:border-action-primary data-[checked]:bg-action-primary data-[disabled]:opacity-50 data-[indeterminate]:border-action-primary data-[indeterminate]:bg-action-primary motion-reduce:transition-none",
            typeof className === "function" ? className(state) : className,
          )
        }
      >
        <BaseCheckbox.Indicator className="group flex">
          <Check
            aria-hidden
            className="size-(--spacing-icon-sm) group-data-[indeterminate]:hidden"
          />
          <Minus
            aria-hidden
            className="hidden size-(--spacing-icon-sm) group-data-[indeterminate]:block"
          />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </label>
  );
}
