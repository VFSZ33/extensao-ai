import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "@/components/checkbox";

describe("Checkbox", () => {
  it("associa o rótulo e informa a mudança pelo clique e pelo teclado", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Checkbox
        checked={false}
        label="Unidade Norte"
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole("checkbox", { name: "Unidade Norte" });
    expect(control).not.toBeChecked();
    await user.click(screen.getByText("Unidade Norte"));
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
    rerender(
      <Checkbox
        checked
        label="Unidade Norte"
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(control).toBeChecked();
    control.focus();
    await user.keyboard(" ");
    expect(onCheckedChange.mock.calls[1]?.[0]).toBe(false);
  });

  it("marca e desmarca todos pelo item pai de um grupo, com estado parcial", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <CheckboxGroup
        allValues={["north", "south"]}
        onValueChange={onValueChange}
        value={["north"]}
      >
        <Checkbox label="Todas" parent />
        <Checkbox label="Unidade Norte" value="north" />
        <Checkbox label="Unidade Sul" value="south" />
      </CheckboxGroup>,
    );
    const parent = screen.getByRole("checkbox", { name: "Todas" });
    expect(parent).toHaveAttribute("aria-checked", "mixed");
    await user.click(parent);
    expect(onValueChange.mock.calls[0]?.[0]).toEqual(["north", "south"]);
    rerender(
      <CheckboxGroup
        allValues={["north", "south"]}
        onValueChange={onValueChange}
        value={["north", "south"]}
      >
        <Checkbox label="Todas" parent />
        <Checkbox label="Unidade Norte" value="north" />
        <Checkbox label="Unidade Sul" value="south" />
      </CheckboxGroup>,
    );
    expect(parent).toBeChecked();
    await user.click(parent);
    expect(onValueChange.mock.calls[1]?.[0]).toEqual([]);
  });

  it("não muda quando está desabilitado", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Checkbox
        checked
        disabled
        label="Unidade Norte"
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole("checkbox", { name: "Unidade Norte" });
    expect(control).toHaveAttribute("aria-disabled", "true");
    await user.click(control);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
