import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "@/components/switch";

describe("Switch", () => {
  it("associa o rótulo e informa a mudança pelo clique e pelo teclado", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Switch
        checked={false}
        label="Atualizar automaticamente"
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole("switch", {
      name: "Atualizar automaticamente",
    });
    expect(control).not.toBeChecked();
    await user.click(screen.getByText("Atualizar automaticamente"));
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
    rerender(
      <Switch
        checked
        label="Atualizar automaticamente"
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(control).toBeChecked();
    control.focus();
    await user.keyboard(" ");
    expect(onCheckedChange.mock.calls[1]?.[0]).toBe(false);
  });

  it("não muda quando está desabilitado", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Switch
        checked
        disabled
        label="Atualizar automaticamente"
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole("switch", {
      name: "Atualizar automaticamente",
    });
    expect(control).toHaveAttribute("aria-disabled", "true");
    await user.click(control);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
