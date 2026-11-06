import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { useId } from "react";

import type { FormSelect } from "@/lib/page-command";

import { Checkbox } from "@/components/checkbox";

export type UnitPickerProps = {
  "aria-describedby"?: string;
  disabled?: boolean;
  onValueChange: (value: string[]) => void;
  select: FormSelect;
  value: string[];
};

export function UnitPicker({
  "aria-describedby": ariaDescribedBy,
  disabled = false,
  onValueChange,
  select,
  value,
}: UnitPickerProps) {
  const labelId = useId();

  return (
    <CheckboxGroup
      allValues={select.options.map((option) => option.value)}
      aria-describedby={ariaDescribedBy}
      aria-labelledby={labelId}
      className="flex flex-col gap-2"
      disabled={disabled}
      onValueChange={onValueChange}
      value={value}
    >
      <p className="control-label text-text-secondary" id={labelId}>
        {select.label}
      </p>
      <Checkbox label="Todas" parent />
      <div className="flex flex-col gap-2 pl-8">
        {select.options.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            value={option.value}
          />
        ))}
      </div>
    </CheckboxGroup>
  );
}
