import { CircleCheck, FlaskConical } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { verifyExtension } from "@/lib/extension-messaging";

type VerificationState =
  | { message: string; status: "error" | "success" }
  | { status: "idle" | "loading" };

export function ExtensionPopup() {
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
  });

  async function handleVerify() {
    setVerification({ status: "loading" });

    try {
      const message = await verifyExtension();
      setVerification({ message, status: "success" });
    } catch {
      setVerification({
        message: "Não foi possível verificar a extensão. Tente novamente.",
        status: "error",
      });
    }
  }

  return (
    <main className="flex w-(--spacing-popup-width) flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <FlaskConical aria-hidden className="size-8 text-action-primary" />
        <h1 className="popup-title">Teste de integração de leads</h1>
        <p className="text-text-secondary">
          A base da extensão está pronta. O fluxo de preenchimento e validação
          de leads será desenvolvido nas próximas etapas.
        </p>
      </header>
      <section
        aria-label="Verificação da extensão"
        className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
      >
        <p>Confira a comunicação entre esta interface e o background.</p>
        <Button
          loading={verification.status === "loading"}
          loadingLabel="Verificando extensão…"
          onClick={handleVerify}
        >
          <CircleCheck aria-hidden />
          Verificar extensão
        </Button>
        <div aria-atomic="true" aria-live="polite" role="status">
          {verification.status === "success" && (
            <p className="text-action-primary">{verification.message}</p>
          )}
        </div>
        {verification.status === "error" && (
          <p className="text-feedback-error" role="alert">
            {verification.message}
          </p>
        )}
      </section>
    </main>
  );
}
