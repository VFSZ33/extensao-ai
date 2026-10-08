import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Select } from "@/components/select";

const items = [
  { label: "Nenhuma", value: null },
  { label: "Unidade Norte", value: "north" },
  { label: "Unidade Sul", value: "south" },
];

describe("Select", () => {
  it("mostra o rótulo, a opção atual e informa a opção escolhida", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        items={items}
        label="Unidade"
        onValueChange={onValueChange}
        value="north"
      />,
    );
    const select = screen.getByRole("combobox", { name: "Unidade" });
    expect(select).toHaveTextContent("Unidade Norte");
    await user.click(select);
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Nenhuma", "Unidade Norte", "Unidade Sul"]);
    expect(
      screen.getByRole("option", { name: "Unidade Norte" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "Unidade Sul" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe("south");
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Nenhuma" }));
    expect(onValueChange.mock.calls[1]?.[0]).toBeNull();
  });

  it("não abre quando está desabilitado", async () => {
    const user = userEvent.setup();
    render(
      <Select
        disabled
        items={items}
        label="Unidade"
        onValueChange={vi.fn()}
        value={null}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Unidade" });
    expect(select).toHaveTextContent("Nenhuma");
    await user.click(select);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
