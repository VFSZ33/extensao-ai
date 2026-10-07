import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";

import { ExtensionPopup } from "@/components/extension-popup";

const runtime: { sendMessage: (message: unknown) => Promise<unknown> } =
  browser.runtime;

describe("Popup da extensão", () => {
  it("mostra a base e confirma a conexão com o background", async () => {
    vi.spyOn(runtime, "sendMessage").mockResolvedValue({
      message: "Extensão conectada ao background.",
      ok: true,
    });
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    expect(
      screen.getByRole("heading", { name: "Teste de integração de leads" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Extensão conectada ao background.",
    );
  });

  it("permite tentar novamente quando o background falha", async () => {
    const sendMessage = vi
      .spyOn(runtime, "sendMessage")
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({
        message: "Extensão conectada ao background.",
        ok: true,
      });
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível verificar a extensão. Tente novamente.",
    );
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Extensão conectada ao background.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("impede envio duplicado enquanto verifica e mantém o foco", async () => {
    let finish: (response: unknown) => void = () => {};
    vi.spyOn(runtime, "sendMessage").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    const button = screen.getByRole("button", {
      name: "Verificando extensão…",
    });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    finish({ message: "Extensão conectada ao background.", ok: true });
    expect(
      await screen.findByRole("button", { name: "Verificar extensão" }),
    ).toHaveFocus();
  });
});
