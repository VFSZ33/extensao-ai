import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type SelectItem = { label: string; value: null | string };

export type SelectProps = {
  items: SelectItem[];
  label: ReactNode;
  onValueChange: (value: null | string) => void;
  value: null | string;
} & Omit<ComponentProps<typeof BaseSelect.Trigger>, "children" | "value">;

export function Select({
  className,
  disabled = false,
  items,
  label,
  onValueChange,
  value,
  ...props
}: SelectProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <BaseSelect.Root
        disabled={disabled}
        items={items}
        onValueChange={onValueChange}
        value={value}
      >
        <BaseSelect.Label className="control-label text-text-secondary">
          {label}
        </BaseSelect.Label>
        <BaseSelect.Trigger
          {...props}
          className={(state) =>
            twMerge(
              "control-label inline-flex h-(--spacing-control-default) min-w-0 cursor-pointer items-center justify-between gap-2 rounded-(--radius-input) border border-border-emphasis bg-surface-elevated px-(--spacing-padding-button-inline) text-text-primary transition-colors duration-(--transition-duration-control) ease-(--ease-standard) not-data-[disabled]:hover:border-border-control not-data-[disabled]:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary data-[disabled]:cursor-not-allowed data-[disabled]:border-dashed data-[disabled]:text-text-muted data-[popup-open]:border-action-primary motion-reduce:transition-none",
              typeof className === "function" ? className(state) : className,
            )
          }
        >
          <BaseSelect.Value className="min-w-0 truncate" />
          <BaseSelect.Icon className="inline-flex shrink-0">
            <ChevronDown aria-hidden className="size-(--spacing-icon-sm)" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner
            alignItemWithTrigger={false}
            className="z-10 outline-none"
            sideOffset={4}
          >
            <BaseSelect.Popup className="max-h-(--available-height) w-(--anchor-width) overflow-y-auto rounded-(--radius-input) border border-border-emphasis bg-surface-elevated p-1 text-text-primary outline-none">
              <BaseSelect.List>
                {items.map((item) => (
                  <BaseSelect.Item
                    className="control-option grid cursor-pointer grid-cols-[var(--spacing-icon-sm)_1fr] items-center gap-2 rounded-(--radius-input) px-2 py-1 outline-none data-[highlighted]:bg-surface-hover"
                    key={item.value ?? ""}
                    value={item.value}
                  >
                    <BaseSelect.ItemIndicator className="col-start-1 inline-flex">
                      <Check aria-hidden className="size-(--spacing-icon-sm)" />
                    </BaseSelect.ItemIndicator>
                    <BaseSelect.ItemText className="col-start-2 wrap-anywhere">
                      {item.label}
                    </BaseSelect.ItemText>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}
