import { PanelRight } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { Button } from "@/components/button";

export function SidePanelOpener() {
  const [failed, setFailed] = useState(false);
  const [windowId, setWindowId] = useState<number>();

  useEffect(() => {
    let active = true;

    if (typeof browser.sidePanel?.open !== "function") {
      return;
    }

    void browser.windows.getCurrent().then(
      (current) => {
        if (active && current?.id !== undefined) {
          setWindowId(current.id);
        }
      },
      () => undefined,
    );

    return () => {
      active = false;
    };
  }, []);

  if (windowId === undefined) {
    return null;
  }

  function handleOpen(id: number) {
    setFailed(false);
    browser.sidePanel.open({ windowId: id }).then(
      () => {
        window.close();
      },
      () => {
        setFailed(true);
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => handleOpen(windowId)} variant="secondary">
        <PanelRight aria-hidden />
        Abrir no painel lateral
      </Button>
      <div aria-atomic="true" aria-live="polite">
        {failed && (
          <p className="text-feedback-error">
            Não foi possível abrir o painel lateral neste navegador. Continue
            pelo popup ou tente de novo.
          </p>
        )}
      </div>
    </div>
  );
}
