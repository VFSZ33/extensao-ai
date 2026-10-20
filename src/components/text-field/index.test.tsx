import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TextField } from "@/components/text-field";

describe("TextField", () => {
  it("associa o rótulo e informa o texto digitado", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TextField
        label="Busca"
        onValueChange={onValueChange}
        placeholder="Identificador"
        value=""
      />,
    );
    const field = screen.getByRole("textbox", { name: "Busca" });
    expect(field).toHaveAttribute("placeholder", "Identificador");
    await user.type(field, "L");
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe("L");
  });

  it("não aceita digitação quando está desabilitado", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TextField
        disabled
        label="Busca"
        onValueChange={onValueChange}
        value=""
      />,
    );
    const field = screen.getByRole("textbox", { name: "Busca" });
    expect(field).toBeDisabled();
    await user.type(field, "L");
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
