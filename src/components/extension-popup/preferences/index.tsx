import { useId, useState } from "react";

import { Switch } from "@/components/switch";
import { AUTO_REFRESH_INTERVAL_MS } from "@/lib/auto-refresh";
import {
  TRACKING_DURATION_MS,
  TRACKING_INTERVAL_MS,
} from "@/lib/submission-tracking";

export type PreferencesProps = {
  autoRefresh: boolean | undefined;
  onAutoRefreshChange: (enabled: boolean) => Promise<void>;
};

export function Preferences({
  autoRefresh,
  onAutoRefreshChange,
}: PreferencesProps) {
  const [failed, setFailed] = useState(false);
  const sectionId = useId();

  async function handleChange(enabled: boolean) {
    setFailed(false);

    try {
      await onAutoRefreshChange(enabled);
    } catch {
      setFailed(true);
    }
  }

  return (
    <section
      aria-labelledby={sectionId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
    >
      <h2 className="popup-section-title" id={sectionId}>
        Preferências
      </h2>
      <Switch
        checked={autoRefresh ?? false}
        disabled={autoRefresh === undefined}
        label="Atualizar automaticamente"
        onCheckedChange={(enabled) => {
          void handleChange(enabled);
        }}
      />
      <p className="text-text-secondary">
        {"Depois de cada envio, consulta o lead no painel aberto a cada " +
          TRACKING_INTERVAL_MS / 1000 +
          " s, por até " +
          TRACKING_DURATION_MS / 60000 +
          " min, enquanto ele estiver pendente ou sem evento. Na verificação das integrações, atualiza o resultado a cada " +
          AUTO_REFRESH_INTERVAL_MS / 1000 +
          " s. Só consulta com o popup ou o painel lateral à vista."}
      </p>
      <div aria-atomic="true" aria-live="polite">
        {failed && (
          <p className="text-feedback-error">
            Não foi possível salvar a preferência. Tente de novo.
          </p>
        )}
      </div>
    </section>
  );
}
