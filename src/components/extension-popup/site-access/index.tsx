import { LockOpen } from "lucide-react";
import { useId, useState } from "react";

import type { PageTarget } from "@/hooks/use-page-targets";

import { Button } from "@/components/button";
import { requestPageAccess } from "@/lib/page-access";

export type SiteAccessProps = { target: PageTarget | undefined };

export function SiteAccess({ target }: SiteAccessProps) {
  const [request, setRequest] = useState<{
    status: "denied" | "error" | "loading";
    url: string;
  }>();
  const sectionId = useId();
  const host =
    target && URL.canParse(target.url) ? new URL(target.url).host : "";
  const status = request?.url === target?.url ? request?.status : undefined;

  async function handleRequest(url: string) {
    const requesting = requestPageAccess(url);
    setRequest({ status: "loading", url });

    try {
      const granted = await requesting;
      setRequest(granted ? undefined : { status: "denied", url });
    } catch {
      setRequest({ status: "error", url });
    }
  }

  return (
    <section
      aria-labelledby={sectionId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
    >
      <h2 className="popup-section-title" id={sectionId}>
        Acesso a esta aba
      </h2>
      {!target && (
        <p className="text-feedback-error">
          Não foi possível identificar a aba ativa desta janela.
        </p>
      )}
      {target?.access === "unsupported" && (
        <p>
          O painel lateral só age em páginas https. Em outras páginas web, use o
          popup, pelo ícone da extensão.
        </p>
      )}
      {target?.access === "missing" && (
        <>
          <p className="wrap-anywhere">
            {"A extensão ainda não tem acesso a " +
              host +
              ". Permita uma vez: o navegador pergunta e lembra da resposta para este site."}
          </p>
          <Button
            loading={status === "loading"}
            loadingLabel="Aguardando o navegador…"
            onClick={() => handleRequest(target.url)}
          >
            <LockOpen aria-hidden />
            Permitir acesso a este site
          </Button>
        </>
      )}
      <div aria-atomic="true" aria-live="polite">
        {status === "denied" && (
          <p className="wrap-anywhere text-feedback-error">
            {"O acesso a " +
              host +
              " não foi permitido. Sem ele, o painel lateral não age nesta aba; o popup, pelo ícone da extensão, continua funcionando."}
          </p>
        )}
        {status === "error" && (
          <p className="text-feedback-error">
            Não foi possível pedir o acesso a este site. Tente de novo.
          </p>
        )}
      </div>
    </section>
  );
}
