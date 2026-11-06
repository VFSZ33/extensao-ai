import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import type { SubmissionRecord } from "@/lib/submission-history";

import iconUrl from "@/assets/icon.svg";
import { Button } from "@/components/button";
import { LeadIntegrations } from "@/components/extension-popup/lead-integrations";
import { PageForms } from "@/components/extension-popup/page-forms";
import { Preferences } from "@/components/extension-popup/preferences";
import { SidePanelOpener } from "@/components/extension-popup/side-panel-opener";
import { SiteAccess } from "@/components/extension-popup/site-access";
import {
  SubmissionHistory,
  type SubmissionHistoryProps,
} from "@/components/extension-popup/submission-history";
import { useAutoRefreshPreference } from "@/hooks/use-auto-refresh-preference";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { usePageTargets } from "@/hooks/use-page-targets";
import { useSubmissionTracking } from "@/hooks/use-submission-tracking";
import { verifyExtension } from "@/lib/extension-messaging";
import { isPanelActive } from "@/lib/panel-leads";
import { readSubmissionHistory } from "@/lib/submission-history";

export type ExtensionPopupProps = { surface?: ExtensionSurface };

export type ExtensionSurface = "popup" | "side-panel";

type VerificationState =
  | { message: string; status: "error" | "success" }
  | { status: "idle" | "loading" };

export function ExtensionPopup({ surface = "popup" }: ExtensionPopupProps) {
  const [activePage, setActivePage] = useState<"page" | "panel" | "unknown">(
    "unknown",
  );
  const autoRefresh = useAutoRefreshPreference();
  const documentVisible = useDocumentVisible();
  const [history, setHistory] = useState<SubmissionHistoryProps["history"]>({
    status: "loading",
  });
  const sidePanel = surface === "side-panel";
  const targets = usePageTargets(sidePanel);
  const tracking = useSubmissionTracking(
    autoRefresh.enabled === true,
    documentVisible,
  );
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
  });

  useEffect(() => {
    let active = true;

    if (!sidePanel) {
      void isPanelActive().then((panel) => {
        if (active) {
          setActivePage(panel ? "panel" : "page");
        }
      });
    }

    void loadHistory().then((state) => {
      if (active) {
        setHistory(state);
      }
    });

    return () => {
      active = false;
    };
  }, [sidePanel]);

  async function handleHistoryChanged() {
    setHistory(await loadHistory());
  }

  async function handleSubmitted(record?: SubmissionRecord) {
    if (record && autoRefresh.enabled) {
      tracking.track(record.id);
    }

    await handleHistoryChanged();
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
    <main
      className={twMerge(
        "flex flex-col gap-6 p-6",
        sidePanel ? "w-full min-w-0" : "w-(--spacing-popup-width)",
      )}
    >
      <header className="flex flex-col gap-3">
        <img alt="" className="size-8" src={iconUrl} />
        <h1 className="popup-title">Scanner de Leads</h1>
        <p className="text-text-secondary">
          Preencha e envie um formulário de lead da página aberta com dados de
          teste identificáveis. Use o histórico para comparar com o lead que
          chega ao painel e, com o painel aberto, verifique o envio dos leads às
          integrações.
        </p>
        {!sidePanel && <SidePanelOpener />}
      </header>
      {!sidePanel && activePage === "page" && (
        <PageForms onSubmitted={handleSubmitted} />
      )}
      {!sidePanel && activePage === "panel" && (
        <LeadIntegrations
          autoRefresh={autoRefresh.enabled === true}
          history={history}
        />
      )}
      {sidePanel &&
        targets.status !== "loading" &&
        targets.current?.access !== "granted" && (
          <SiteAccess target={targets.current} />
        )}
      {sidePanel && targets.page && (
        <div hidden={targets.current !== targets.page}>
          <PageForms onSubmitted={handleSubmitted} target={targets.page} />
        </div>
      )}
      {sidePanel && targets.panel && (
        <div hidden={targets.current !== targets.panel}>
          <LeadIntegrations
            autoRefresh={autoRefresh.enabled === true}
            history={history}
            target={targets.panel}
            visible={targets.current === targets.panel}
          />
        </div>
      )}
      <SubmissionHistory
        history={history}
        onCleared={handleHistoryChanged}
        tracking={tracking.trackings}
        trackingEnabled={autoRefresh.enabled === true}
      />
      <Preferences
        autoRefresh={autoRefresh.enabled}
        onAutoRefreshChange={autoRefresh.save}
      />
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
