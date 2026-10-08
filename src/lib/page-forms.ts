import { browser } from "wxt/browser";

import { createLeadData, createSubmissionId } from "@/lib/lead-data";
import {
  isFilledValues,
  isRecognizedForms,
  PAGE_COMMAND_KEY,
  type PageCommand,
  parsePageResponse,
  type RecognizedForm,
} from "@/lib/page-command";
import {
  addSubmission,
  type SubmissionRecord,
  takeSubmissionSequence,
} from "@/lib/submission-history";

export type PageForms = {
  forms: RecognizedForm[];
  pageUrl: string;
  tabId: number;
};

export async function detectPageForms(): Promise<PageForms> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (tab?.id === undefined) {
    throw new Error("Não foi possível identificar a aba ativa.");
  }

  return {
    forms: await runInPage(tab.id, { type: "detect-forms" }, isRecognizedForms),
    pageUrl: tab.url ?? "",
    tabId: tab.id,
  };
}

export async function submitTestLead(
  page: Pick<PageForms, "pageUrl" | "tabId">,
  form: RecognizedForm,
): Promise<SubmissionRecord> {
  const submittedAt = new Date();
  const id = createSubmissionId(submittedAt, await takeSubmissionSequence());
  const values = await runInPage(
    page.tabId,
    {
      definitionId: form.definitionId,
      index: form.index,
      lead: createLeadData(id),
      type: "submit-form",
    },
    isFilledValues,
  );
  const record: SubmissionRecord = {
    definitionId: form.definitionId,
    definitionName: form.definitionName,
    formLabel: form.label,
    id,
    pageUrl: page.pageUrl,
    submittedAt: submittedAt.toISOString(),
    values,
  };

  try {
    await addSubmission(record);
  } catch {
    throw new Error(
      "O envio " + id + " foi disparado, mas não foi gravado no histórico.",
    );
  }

  return record;
}

async function runInPage<Result>(
  tabId: number,
  command: PageCommand,
  isResult: (result: unknown) => result is Result,
): Promise<Result> {
  let result: unknown;

  try {
    await browser.scripting.executeScript({
      args: [PAGE_COMMAND_KEY, command],
      func: storePageCommand,
      target: { tabId },
    });
    const [injection] = await browser.scripting.executeScript({
      files: ["/lead-forms.js"],
      target: { tabId },
    });
    result = injection?.result;
  } catch {
    throw new Error(
      "Não foi possível acessar esta página. Abra uma página web comum e clique no ícone da extensão para tentar de novo.",
    );
  }

  const response = parsePageResponse(result, isResult);

  if (!response) {
    throw new Error("A página retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.result;
}

function storePageCommand(key: string, command: PageCommand): void {
  Reflect.set(globalThis, key, command);
}
