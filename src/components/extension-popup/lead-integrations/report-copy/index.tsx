import { ClipboardCopy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/button";
import {
  createDiagnosticReport,
  type DiagnosticReportInput,
} from "@/lib/integration-report";

export type ReportCopyProps = DiagnosticReportInput;

export function ReportCopy(props: ReportCopyProps) {
  const [copy, setCopy] = useState<"copied" | "error" | "idle">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(createDiagnosticReport(props));
      setCopy("copied");
    } catch {
      setCopy("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleCopy} variant="secondary">
        <ClipboardCopy aria-hidden />
        Copiar relatório
      </Button>
      <div aria-atomic="true" aria-live="polite">
        {copy === "copied" && (
          <p className="text-action-primary">
            Relatório copiado para a área de transferência.
          </p>
        )}
        {copy === "error" && (
          <p className="text-feedback-error">
            Não foi possível copiar o relatório. Tente de novo.
          </p>
        )}
      </div>
    </div>
  );
}
