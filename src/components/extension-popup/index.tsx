import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

import iconUrl from "@/assets/icon.svg";
import { Button } from "@/components/button";
import { LeadIntegrations } from "@/components/extension-popup/lead-integrations";
import { PageForms } from "@/components/extension-popup/page-forms";
import {
  SubmissionHistory,
  type SubmissionHistoryProps,
} from "@/components/extension-popup/submission-history";
import { verifyExtension } from "@/lib/extension-messaging";
import { isPanelActive } from "@/lib/panel-leads";
import { readSubmissionHistory } from "@/lib/submission-history";

type VerificationState =
  | { message: string; status: "error" | "success" }
  | { status: "idle" | "loading" };

export function ExtensionPopup() {
  const [activePage, setActivePage] = useState<"page" | "panel" | "unknown">(
    "unknown",
  );
  const [history, setHistory] = useState<SubmissionHistoryProps["history"]>({
    status: "loading",
  });
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
  });

  useEffect(() => {
    let active = true;

    void isPanelActive().then((panel) => {
      if (active) {
        setActivePage(panel ? "panel" : "page");
      }
    });
    void loadHistory().then((state) => {
      if (active) {
        setHistory(state);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmitted() {
    setHistory(await loadHistory());
  }

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
        <img alt="" className="size-8" src={iconUrl} />
        <h1 className="popup-title">Scanner de Leads</h1>
        <p className="text-text-secondary">
          Preencha e envie um formulário de lead da página aberta com dados de
          teste identificáveis. Use o histórico para comparar com o lead que
          chega ao painel e, com o painel aberto, verifique o envio dos leads às
          integrações.
        </p>
      </header>
      {activePage === "page" && <PageForms onSubmitted={handleSubmitted} />}
      {activePage === "panel" && <LeadIntegrations history={history} />}
      <SubmissionHistory history={history} />
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

async function loadHistory(): Promise<SubmissionHistoryProps["history"]> {
  try {
    return { records: await readSubmissionHistory(), status: "ready" };
  } catch {
    return { status: "error" };
  }
}
