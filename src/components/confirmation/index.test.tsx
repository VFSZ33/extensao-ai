import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Confirmation } from "@/components/confirmation";

describe("Confirmation", () => {
  it("recebe o foco, descreve a ação e confirma ou cancela", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <Confirmation
        confirmLabel="Apagar"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Apagar o item?"
      >
        <p>O item some deste navegador.</p>
      </Confirmation>,
    );
    const group = screen.getByRole("group", { name: "Apagar o item?" });
    expect(group).toHaveFocus();
    expect(group).toHaveAccessibleDescription("O item some deste navegador.");
    await user.click(screen.getByRole("button", { name: "Apagar" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("não cancela enquanto a ação está em andamento", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <Confirmation
        confirmLabel="Apagar"
        loading
        loadingLabel="Apagando…"
        onCancel={onCancel}
        onConfirm={vi.fn()}
        title="Apagar o item?"
      >
        <p>O item some deste navegador.</p>
      </Confirmation>,
    );
    expect(screen.getByRole("button", { name: "Apagando…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
