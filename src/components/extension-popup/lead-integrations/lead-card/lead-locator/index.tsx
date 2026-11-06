import { LocateFixed } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/button";
import { describeLeadFocus, type LeadFocusResult } from "@/lib/lead-focus";

export type LeadLocatorProps = {
  describedBy: string;
  emphasized: boolean;
  locate: () => Promise<LeadFocusResult>;
};

type LocateState =
  | { message: string; status: "error" | "located" | "partial" }
  | { status: "idle" | "loading" };

export function LeadLocator({
  describedBy,
  emphasized,
  locate,
}: LeadLocatorProps) {
  const running = useRef(false);
  const [state, setState] = useState<LocateState>({ status: "idle" });

  async function handleLocate() {
    if (running.current) {
      return;
    }

    running.current = true;
    setState({ status: "loading" });

    try {
      const result = await locate();
      setState({
        message: describeLeadFocus(result),
        status: result.row === "highlighted" ? "located" : "partial",
      });
    } catch (error) {
      setState({
        message:
          error instanceof Error && error.message
            ? error.message
            : "Não foi possível localizar o lead no painel.",
        status: "error",
      });
    } finally {
      running.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-describedby={describedBy}
        className="self-start"
        loading={state.status === "loading"}
        loadingLabel="Localizando no painel…"
        onClick={handleLocate}
        variant={emphasized ? "primary" : "secondary"}
      >
        <LocateFixed aria-hidden />
        Localizar no painel
      </Button>
      <div aria-atomic="true" aria-live="polite">
        {state.status === "located" && (
          <p className="text-action-primary">{state.message}</p>
        )}
        {state.status === "partial" && (
          <p className="text-feedback-warning">{state.message}</p>
        )}
        {state.status === "error" && (
          <p className="wrap-anywhere text-feedback-error">{state.message}</p>
        )}
      </div>
    </div>
  );
}
