import { FlaskConical, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PageTarget } from "@/hooks/use-page-targets";
import type { ActiveTab } from "@/lib/active-tab";
import type { RecognizedForm, SelectOption } from "@/lib/page-command";
import type { SubmissionRecord } from "@/lib/submission-history";

import { Button } from "@/components/button";
import { Confirmation } from "@/components/confirmation";
import { QueueStatus } from "@/components/extension-popup/page-forms/queue-status";
import { UnitPicker } from "@/components/extension-popup/page-forms/unit-picker";
import { Select } from "@/components/select";
import { Switch } from "@/components/switch";
import {
  type PageForms as DetectedPage,
  detectPageForms,
  isSameForm,
  submitTestLead,
} from "@/lib/page-forms";
import { classifySite } from "@/lib/site-environment";
import {
  findUnitSelect,
  listPendingUnits,
  runSubmissionQueue,
  type SubmissionQueue,
} from "@/lib/submission-queue";

export type PageFormsProps = {
  onSubmitted: (record?: SubmissionRecord) => void;
  target?: PageTarget;
};

type DetectionState =
  | { message: string; status: "error" }
  | { page: DetectedPage; status: "ready" }
  | { status: "loading" };

type QueueState = {
  cancelling: boolean;
  form: RecognizedForm;
  state: SubmissionQueue;
  tabId: number;
};

type SubmissionState =
  | { formIndex: number; status: "loading" }
  | { message: string; status: "error" }
  | { message: string; status: "success"; unfilledFields: string[] }
  | { status: "idle" };

const IDLE_SUBMISSION: SubmissionState = { status: "idle" };
const LOADING_DETECTION: DetectionState = { status: "loading" };

export function PageForms({ onSubmitted, target }: PageFormsProps) {
  const [confirming, setConfirming] = useState<null | number>(null);
  const tabId = target?.tabId;
  const url = target?.url;
  const targetKey =
    target === undefined
      ? ""
      : target.tabId + " " + target.revision + " " + target.url;
  const [detected, setDetected] = useState<{
    key: string;
    state: DetectionState;
  }>({ key: targetKey, state: LOADING_DETECTION });
  const detection =
    detected.key === targetKey ? detected.state : LOADING_DETECTION;
  const [multiUnits, setMultiUnits] = useState<Record<number, string[]>>({});
  const [queue, setQueue] = useState<QueueState>();
  const queueController = useRef<AbortController>(null);
  const queueFeedback =
    queue && (tabId === undefined || queue.tabId === tabId) ? queue : undefined;
  const queueRunning = queue !== undefined && queue.state.outcome === undefined;
  const sectionId = useId();
  const [selections, setSelections] = useState<
    Record<number, Record<string, null | string>>
  >({});
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
  });
  const [submissionTabId, setSubmissionTabId] = useState<number>();
  const feedback =
    tabId === undefined || submissionTabId === tabId
      ? submission
      : IDLE_SUBMISSION;
  const submitting = submission.status === "loading" || queueRunning;
  const submittingRef = useRef(false);
  const triggers = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    let active = true;

    void detectForms(
      tabId === undefined || url === undefined ? undefined : { id: tabId, url },
    ).then((state) => {
      if (active) {
        setConfirming(null);
        setDetected({ key: targetKey, state });
        setMultiUnits({});
        setSelections({});
      }
    });

    return () => {
      active = false;
    };
  }, [tabId, targetKey, url]);

  useEffect(
    () => () => {
      queueController.current?.abort();
    },
    [],
  );

  function handleCancel(formIndex: number) {
    setConfirming(null);
    triggers.current.get(formIndex)?.focus();
  }

  function handleConfirm(page: DetectedPage, form: RecognizedForm) {
    const units = readChosenUnits(form);
    setConfirming(null);
    triggers.current.get(form.index)?.focus();

    if (units) {
      void handleQueue(page, form, units);
    } else {
      void handleSubmit(page, form);
    }
  }

  function handleMultiUnit(formIndex: number, enabled: boolean) {
    setMultiUnits((current) => {
      const next = { ...current };

      if (enabled) {
        next[formIndex] = [];
      } else {
        delete next[formIndex];
      }

      return next;
    });
  }

  async function handleQueue(
    page: DetectedPage,
    form: RecognizedForm,
    units: SelectOption[],
  ) {
    if (submittingRef.current || units.length === 0) {
      return;
    }

    submittingRef.current = true;
    const controller = new AbortController();
    const unitKey = findUnitSelect(form)?.key;
    queueController.current = controller;
    setSubmission({ status: "idle" });
    setQueue({
      cancelling: false,
      form,
      state: { items: units.map((unit) => ({ status: "pending", unit })) },
      tabId: page.tabId,
    });

    try {
      await runSubmissionQueue({
        form,
        onChange: (state) => {
          setQueue((current) => current && { ...current, state });
        },
        onSubmitted,
        page,
        selections: Object.fromEntries(
          Object.entries(selections[form.index] ?? {}).flatMap(
            ([key, value]) =>
              value === null || key === unitKey ? [] : [[key, value]],
          ),
        ),
        signal: controller.signal,
        units,
      });
    } finally {
      queueController.current = null;
      submittingRef.current = false;
    }
  }

  function handleQueueCancel() {
    queueController.current?.abort();
    setQueue((current) => current && { ...current, cancelling: true });
  }

  async function handleRefresh() {
    const key = targetKey;
    const retry = queueFeedback && {
      form: queueFeedback.form,
      units: listPendingUnits(queueFeedback.state),
    };
    setConfirming(null);
    setDetected({ key, state: LOADING_DETECTION });
    setMultiUnits({});
    setQueue(undefined);
    setSelections({});
    setSubmission({ status: "idle" });
    const state = await detectForms(
      tabId === undefined || url === undefined ? undefined : { id: tabId, url },
    );
    setDetected((current) => (current.key === key ? { key, state } : current));

    if (state.status !== "ready" || !retry || retry.units.length === 0) {
      return;
    }

    const form = state.page.forms.find((candidate) =>
      isSameForm(candidate, retry.form),
    );
    const options = form ? (findUnitSelect(form)?.options ?? []) : [];
    const pending = retry.units.flatMap(({ value }) =>
      options.some((option) => option.value === value) ? [value] : [],
    );

    if (form && pending.length > 0) {
      setMultiUnits({ [form.index]: pending });
    }
  }

  function handleSelect(formIndex: number, key: string, value: null | string) {
    setSelections((current) => ({
      ...current,
      [formIndex]: { ...current[formIndex], [key]: value },
    }));
  }

  async function handleSubmit(page: DetectedPage, form: RecognizedForm) {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setQueue(undefined);
    setSubmission({ formIndex: form.index, status: "loading" });
    setSubmissionTabId(page.tabId);
    let submitted: SubmissionRecord | undefined;

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
      submitted = record;
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

    submittingRef.current = false;
    onSubmitted(submitted);
  }

  function handleUnits(formIndex: number, units: string[]) {
    setMultiUnits((current) => ({ ...current, [formIndex]: units }));
  }

  function readChosenUnits(form: RecognizedForm): SelectOption[] | undefined {
    const chosen = multiUnits[form.index];

    return chosen
      ? (findUnitSelect(form)?.options.filter(({ value }) =>
          chosen.includes(value),
        ) ?? [])
      : undefined;
  }

  const site =
    detection.status === "ready"
      ? classifySite(detection.page.pageUrl)
      : undefined;

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
        dispara o envio na página, depois da sua confirmação.
      </p>
      {detection.status === "ready" && detection.page.forms.length > 0 && (
        <ul className="flex flex-col gap-3">
          {detection.page.forms.map((form) => {
            const chosenUnits = readChosenUnits(form);
            const queued =
              queueFeedback !== undefined &&
              queueRunning &&
              isSameForm(queueFeedback.form, form);
            const unitSelect = findUnitSelect(form);

            return (
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
                    aria-expanded={confirming === form.index}
                    disabled={submitting || chosenUnits?.length === 0}
                    loading={
                      queued ||
                      (feedback.status === "loading" &&
                        feedback.formIndex === form.index)
                    }
                    loadingLabel={
                      queued
                        ? describeQueueStep(queueFeedback.state)
                        : "Enviando…"
                    }
                    onClick={() => setConfirming(form.index)}
                    ref={(element) => {
                      if (element) {
                        triggers.current.set(form.index, element);
                      }

                      return () => {
                        triggers.current.delete(form.index);
                      };
                    }}
                  >
                    <Send aria-hidden />
                    {chosenUnits
                      ? "Enviar para " +
                        chosenUnits.length +
                        (chosenUnits.length === 1 ? " unidade" : " unidades")
                      : "Enviar teste"}
                  </Button>
                </div>
                {unitSelect && unitSelect.options.length > 1 && (
                  <Switch
                    checked={chosenUnits !== undefined}
                    disabled={submitting}
                    label="Enviar para várias unidades"
                    onCheckedChange={(checked) =>
                      handleMultiUnit(form.index, checked)
                    }
                  />
                )}
                {form.selects.map((select) =>
                  chosenUnits && select.key === unitSelect?.key ? (
                    <UnitPicker
                      aria-describedby={sectionId + "-form-" + form.index}
                      disabled={submitting}
                      key={select.key}
                      onValueChange={(units) => handleUnits(form.index, units)}
                      select={select}
                      value={multiUnits[form.index] ?? []}
                    />
                  ) : (
                    <Select
                      aria-describedby={sectionId + "-form-" + form.index}
                      disabled={submitting}
                      items={[
                        { label: "Nenhuma", value: null },
                        ...select.options,
                      ]}
                      key={select.key}
                      label={select.label}
                      onValueChange={(value) =>
                        handleSelect(form.index, select.key, value)
                      }
                      value={selections[form.index]?.[select.key] ?? null}
                    />
                  ),
                )}
                {confirming === form.index && site && (
                  <Confirmation
                    confirmLabel={
                      chosenUnits
                        ? "Confirmar " +
                          chosenUnits.length +
                          (chosenUnits.length === 1 ? " envio" : " envios")
                        : "Confirmar envio"
                    }
                    confirmVariant={
                      site.kind === "test" ? "primary" : "destructive"
                    }
                    onCancel={() => handleCancel(form.index)}
                    onConfirm={() => handleConfirm(detection.page, form)}
                    title={
                      chosenUnits && chosenUnits.length > 1
                        ? "Enviar " + chosenUnits.length + " formulários reais?"
                        : "Enviar um formulário real?"
                    }
                    tone={site.kind === "test" ? "default" : "critical"}
                  >
                    <p className="wrap-anywhere">
                      {form.definitionName +
                        " (" +
                        (form.label || "sem rótulo na página") +
                        ") será preenchido e enviado de verdade em " +
                        (site.host || "um site não identificado") +
                        (chosenUnits
                          ? ", uma vez para cada unidade, um envio de cada vez: " +
                            chosenUnits.map(({ label }) => label).join(", ")
                          : "") +
                        "."}
                    </p>
                    {chosenUnits && (
                      <p>
                        A fila para se a página mudar ou um envio falhar, e pode
                        ser cancelada entre um envio e outro.
                      </p>
                    )}
                    {site.kind === "test" ? (
                      <div className="flex items-start gap-2 text-text-secondary">
                        <span className="flex h-5 shrink-0 items-center">
                          <FlaskConical
                            aria-hidden
                            className="size-(--spacing-icon-sm)"
                          />
                        </span>
                        <p>
                          Site de testes (homologação): o lead vai para o painel
                          do ambiente de testes.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-feedback-error">
                        <span className="flex h-5 shrink-0 items-center">
                          <TriangleAlert
                            aria-hidden
                            className="size-(--spacing-icon-sm)"
                          />
                        </span>
                        <p className="font-medium">
                          Site de cliente (produção): o envio cria um lead real,
                          que a concessionária recebe como contato de verdade.
                        </p>
                      </div>
                    )}
                  </Confirmation>
                )}
              </li>
            );
          })}
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
        {feedback.status === "success" && (
          <p className="wrap-anywhere text-action-primary">
            {feedback.message}
          </p>
        )}
        {feedback.status === "success" &&
          feedback.unfilledFields.length > 0 && (
            <p className="wrap-anywhere text-feedback-warning">
              {(feedback.unfilledFields.length === 1
                ? "Campo do formulário que a extensão não preencheu: "
                : "Campos do formulário que a extensão não preencheu: ") +
                feedback.unfilledFields.join(", ") +
                "."}
            </p>
          )}
        {feedback.status === "error" && (
          <p className="wrap-anywhere text-feedback-error">
            {feedback.message}
          </p>
        )}
      </div>
      {queueFeedback && (
        <QueueStatus
          cancelling={queueFeedback.cancelling}
          onCancel={handleQueueCancel}
          queue={queueFeedback.state}
        />
      )}
    </section>
  );
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function describeQueueStep(queue: SubmissionQueue): string {
  const step = queue.items.findIndex(
    ({ status }) => status === "pending" || status === "sending",
  );

  return (
    "Enviando " +
    (step === -1 ? queue.items.length : step + 1) +
    " de " +
    queue.items.length +
    "…"
  );
}

async function detectForms(tab?: ActiveTab): Promise<DetectionState> {
  try {
    return { page: await detectPageForms(tab), status: "ready" };
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
