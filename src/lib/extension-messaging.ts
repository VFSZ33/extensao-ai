import { browser } from "wxt/browser";

export type VerificationResponse =
  { error: string; ok: false } | { message: string; ok: true };

export function handleExtensionMessage(message: unknown): VerificationResponse {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "verify-extension"
  ) {
    return { error: "Mensagem não suportada.", ok: false };
  }

  return { message: "Extensão conectada ao background.", ok: true };
}

export async function verifyExtension(): Promise<string> {
  const response: unknown = await browser.runtime.sendMessage({
    type: "verify-extension",
  });

  if (
    typeof response !== "object" ||
    response === null ||
    !("ok" in response)
  ) {
    throw new Error("O background retornou uma resposta inválida.");
  }

  if (
    response.ok === false &&
    "error" in response &&
    typeof response.error === "string"
  ) {
    throw new Error(response.error);
  }

  if (
    response.ok !== true ||
    !("message" in response) ||
    typeof response.message !== "string"
  ) {
    throw new Error("O background retornou uma resposta inválida.");
  }

  return response.message;
}
