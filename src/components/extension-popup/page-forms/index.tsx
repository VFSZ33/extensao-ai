import { RefreshCw, Send } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { RecognizedForm } from "@/lib/page-command";

import { Button } from "@/components/button";
import { Select } from "@/components/select";
import {
  type PageForms as DetectedPage,
  detectPageForms,
  submitTestLead,
} from "@/lib/page-forms";

export type PageFormsProps = { onSubmitted: () => void };

type DetectionState =
  | { message: string; status: "error" }
  | { page: DetectedPage; status: "ready" }
  | { status: "loading" };

type SubmissionState =
  | { formIndex: number; status: "loading" }
  | { message: string; status: "error" }
  | { message: string; status: "success"; unfilledFields: string[] }
  | { status: "idle" };

export function PageForms({ onSubmitted }: PageFormsProps) {
  const [detection, setDetection] = useState<DetectionState>({
    status: "loading",
  });
  const sectionId = useId();
  const [selections, setSelections] = useState<
    Record<number, Record<string, null | string>>
  >({});
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
  });
  const submitting = submission.status === "loading";

  useEffect(() => {
    let active = true;

    void detectForms().then((state) => {
      if (active) {
        setDetection(state);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleRefresh() {
    setDetection({ status: "loading" });
    setSelections({});
    setSubmission({ status: "idle" });
    setDetection(await detectForms());
  }

  function handleSelect(formIndex: number, key: string, value: null | string) {
    setSelections((current) => ({
      ...current,
      [formIndex]: { ...current[formIndex], [key]: value },
    }));
  }

  async function handleSubmit(page: DetectedPage, form: RecognizedForm) {
    setSubmission({ formIndex: form.index, status: "loading" });

    try {
      const { record, unfilledFields } = await submitTestLead(
        page,
        form,
        Object.fromEntries(
          Object.entries(selections[form.index] ?? {}).flatMap(
            ([key, value]) => (value === null ? [] : [[key, value]]),
          ),
        ),
      );
      setSubmission({
        message:
          "Envio " +
          record.id +
          " disparado. Confira o lead no painel com os dados do histórico.",
        status: "success",
        unfilledFields,
      });
    } catch (error) {
      setSubmission({
        message: describeError(error, "Não foi possível enviar o formulário."),
        status: "error",
      });
    }

    onSubmitted();
  }

  return (
    <section
      aria-labelledby={sectionId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-panel p-4"
    >
      <h2 className="popup-section-title" id={sectionId}>
        Formulários da página
      </h2>
      <p>
        Cada envio preenche o formulário escolhido com dados de teste novos e
        dispara o envio na página.
      </p>
      {detection.status === "ready" && detection.page.forms.length > 0 && (
        <ul className="flex flex-col gap-3">
          {detection.page.forms.map((form) => (
            <li className="flex flex-col gap-2" key={form.index}>
              <div className="flex items-center justify-between gap-3">
                <div
                  className="flex min-w-0 flex-col gap-1"
                  id={sectionId + "-form-" + form.index}
                >
                  <p className="font-medium">{form.definitionName}</p>
                  <p className="wrap-anywhere text-text-secondary">
                    {form.label || "Sem rótulo na página"}
                  </p>
                </div>
                <Button
                  aria-describedby={sectionId + "-form-" + form.index}
                  disabled={submitting}
                  loading={
                    submission.status === "loading" &&
                    submission.formIndex === form.index
                  }
                  loadingLabel="Enviando…"
                  onClick={() => handleSubmit(detection.page, form)}
                >
                  <Send aria-hidden />
                  Enviar teste
                </Button>
              </div>
              {form.selects.map((select) => (
                <Select
                  aria-describedby={sectionId + "-form-" + form.index}
                  disabled={submitting}
                  items={[{ label: "Nenhuma", value: null }, ...select.options]}
                  key={select.key}
                  label={select.label}
                  onValueChange={(value) =>
                    handleSelect(form.index, select.key, value)
                  }
                  value={selections[form.index]?.[select.key] ?? null}
                />
              ))}
            </li>
          ))}
        </ul>
      )}
      <Button
        disabled={submitting}
        loading={detection.status === "loading"}
        loadingLabel="Procurando formulários…"
        onClick={handleRefresh}
        variant="secondary"
      >
        <RefreshCw aria-hidden />
        Atualizar lista
      </Button>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="flex flex-col gap-3"
      >
        {detection.status === "ready" && detection.page.forms.length === 0 && (
          <p className="text-text-secondary">
            Nenhum formulário reconhecido nesta página.
          </p>
        )}
        {detection.status === "error" && (
          <p className="text-feedback-error">{detection.message}</p>
        )}
        {submission.status === "success" && (
          <p className="wrap-anywhere text-action-primary">
            {submission.message}
          </p>
        )}
        {submission.status === "success" &&
          submission.unfilledFields.length > 0 && (
            <p className="wrap-anywhere text-feedback-warning">
              {(submission.unfilledFields.length === 1
                ? "Campo do formulário que a extensão não preencheu: "
                : "Campos do formulário que a extensão não preencheu: ") +
                submission.unfilledFields.join(", ") +
                "."}
            </p>
          )}
        {submission.status === "error" && (
          <p className="wrap-anywhere text-feedback-error">
            {submission.message}
          </p>
        )}
      </div>
    </section>
  );
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function detectForms(): Promise<DetectionState> {
  try {
    return { page: await detectPageForms(), status: "ready" };
  } catch (error) {
    return {
      message: describeError(
        error,
        "Não foi possível procurar formulários nesta página.",
      ),
      status: "error",
    };
  }
}
