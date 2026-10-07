import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";

import {
  handleExtensionMessage,
  verifyExtension,
} from "@/lib/extension-messaging";

const runtime: { sendMessage: (message: unknown) => Promise<unknown> } =
  browser.runtime;

describe("Mensagens da extensão", () => {
  it("responde à verificação reconhecida", () => {
    expect(handleExtensionMessage({ type: "verify-extension" })).toEqual({
      message: "Extensão conectada ao background.",
      ok: true,
    });
  });

  it.each([null, undefined, "verify-extension", {}, { type: "other" }])(
    "rejeita a mensagem desconhecida %j",
    (message) => {
      expect(handleExtensionMessage(message)).toEqual({
        error: "Mensagem não suportada.",
        ok: false,
      });
    },
  );

  it("envia a mensagem e valida o retorno do background", async () => {
    const sendMessage = vi.spyOn(runtime, "sendMessage").mockResolvedValue({
      message: "Extensão conectada ao background.",
      ok: true,
    });
    await expect(verifyExtension()).resolves.toBe(
      "Extensão conectada ao background.",
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "verify-extension" });
  });

  it.each([
    undefined,
    null,
    {},
    { ok: true },
    { ok: false },
    { message: "invalid", ok: "true" },
  ])("rejeita a resposta inválida %j", async (response) => {
    vi.spyOn(runtime, "sendMessage").mockResolvedValue(response);
    await expect(verifyExtension()).rejects.toThrow(
      "O background retornou uma resposta inválida.",
    );
  });

  it("propaga um erro informado pelo background", async () => {
    vi.spyOn(runtime, "sendMessage").mockResolvedValue({
      error: "Mensagem não suportada.",
      ok: false,
    });
    await expect(verifyExtension()).rejects.toThrow("Mensagem não suportada.");
  });

  it("propaga a indisponibilidade do background", async () => {
    vi.spyOn(runtime, "sendMessage").mockRejectedValue(
      new Error("Receiving end does not exist."),
    );
    await expect(verifyExtension()).rejects.toThrow(
      "Receiving end does not exist.",
    );
  });
});
