import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { type ComponentProps, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type SwitchProps = {
  label: ReactNode;
} & Omit<ComponentProps<typeof BaseSwitch.Root>, "children">;

export function Switch({ className, label, ...props }: SwitchProps) {
  return (
    <label className="control-label flex cursor-pointer items-center gap-3 text-text-primary has-data-[disabled]:cursor-not-allowed has-data-[disabled]:text-text-muted">
      <BaseSwitch.Root
        {...props}
        className={(state) =>
          twMerge(
            "flex h-6 w-10 shrink-0 items-center rounded-(--radius-input) bg-border-emphasis p-1 transition-colors duration-(--transition-duration-control) ease-(--ease-standard) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary data-[checked]:bg-action-primary data-[disabled]:opacity-50 motion-reduce:transition-none",
            typeof className === "function" ? className(state) : className,
          )
        }
      >
        <BaseSwitch.Thumb className="size-4 rounded-(--radius-input) bg-text-primary transition-[translate,background-color] duration-(--transition-duration-control) ease-(--ease-standard) data-[checked]:translate-x-4 data-[checked]:bg-action-on-primary motion-reduce:transition-none" />
      </BaseSwitch.Root>
      {label}
    </label>
  );
}
