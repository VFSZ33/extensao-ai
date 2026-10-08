import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { ExtensionPopup } from "@/components/extension-popup";
import { addSubmission } from "@/lib/submission-history";

const runtime: { sendMessage: (message: unknown) => Promise<unknown> } =
  browser.runtime;
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;

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

  it("mostra o histórico gravado e acrescenta cada envio novo", async () => {
    fakeBrowser.reset();
    await addSubmission({
      definitionId: "autodromo-offer",
      definitionName: "Formulário de oferta",
      formLabel: "oferta - GEELY EX5 PRO - Enviar",
      id: "LT-20261006-101500-001",
      pageUrl: "https://example.com/",
      submittedAt: "2026-10-06T13:15:00.000Z",
      values: { name: "Teste LT-20261006-101500-001" },
    });
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: "https://example.com/" },
    ]);
    let command: unknown;
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async (injection) => {
        if ("args" in injection) {
          command = injection.args?.[1];
        }

        return [
          {
            documentId: "document",
            frameId: 0,
            result:
              typeof command === "object" &&
              command !== null &&
              "lead" in command
                ? { ok: true, result: command.lead }
                : {
                    ok: true,
                    result: [
                      {
                        definitionId: "autodromo-section",
                        definitionName: "Formulário de seção",
                        index: 1,
                        label: "Título da seção - Enviar",
                      },
                    ],
                  },
          },
        ];
      },
    );
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    const history = screen.getByRole("region", { name: "Histórico de envios" });
    expect(await within(history).findAllByRole("listitem")).toHaveLength(1);
    await user.click(
      await screen.findByRole("button", { name: "Enviar teste" }),
    );
    const message = await screen.findByText(
      /^Envio LT-\d{8}-\d{6}-001 disparado\./,
    );
    const id = /LT-\d{8}-\d{6}-001/.exec(message.textContent)?.[0] ?? "";
    await waitFor(() =>
      expect(within(history).getAllByRole("listitem")).toHaveLength(2),
    );
    const items = within(history).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(id);
    expect(items[0]).toHaveTextContent(
      "Formulário de seção · Título da seção - Enviar",
    );
    expect(items[0]).toHaveTextContent("Teste " + id);
    expect(items[0]).toHaveTextContent(id.toLowerCase() + "@example.com");
    expect(items[1]).toHaveTextContent("LT-20261006-101500-001");
  });
});
