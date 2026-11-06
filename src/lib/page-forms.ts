import { browser } from "wxt/browser";

import { type ActiveTab, getActiveTab } from "@/lib/active-tab";
import { createLeadData, createSubmissionId } from "@/lib/lead-data";
import {
  isRecognizedForms,
  isSelectOption,
  isSubmissionResult,
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
  documentId?: string;
  forms: RecognizedForm[];
  pageUrl: string;
  tabId: number;
};

export type TestLeadSubmission = {
  record: SubmissionRecord;
  unfilledFields: string[];
};

type PageResult<Result> = { documentId?: string; result: Result };

export async function detectPageForms(tab?: ActiveTab): Promise<PageForms> {
  const page = tab ?? (await getActiveTab());
  const { documentId, result } = await runInPage(
    page.id,
    { type: "detect-forms" },
    isRecognizedForms,
  );

  return {
    ...(documentId !== undefined && { documentId }),
    forms: result,
    pageUrl: page.url,
    tabId: page.id,
  };
}

export async function findUnchangedForm(
  page: PageForms,
  form: RecognizedForm,
): Promise<RecognizedForm | undefined> {
  if (page.documentId === undefined) {
    return undefined;
  }

  try {
    const tab = await browser.tabs.get(page.tabId);

    if (!tab.active || tab.url !== page.pageUrl) {
      return undefined;
    }

    const { result } = await runInPage(
      page.tabId,
      { type: "detect-forms" },
      isRecognizedForms,
      page.documentId,
    );

    return result.find((candidate) => isSameForm(candidate, form));
  } catch {
    return undefined;
  }
}

export function isSameForm(
  candidate: RecognizedForm,
  form: RecognizedForm,
): boolean {
  return (
    candidate.definitionId === form.definitionId &&
    candidate.index === form.index &&
    candidate.label === form.label
  );
}

export async function submitTestLead(
  page: Pick<PageForms, "pageUrl" | "tabId">,
  form: RecognizedForm,
  selections: Record<string, string> = {},
  documentId?: string,
): Promise<TestLeadSubmission> {
  const submittedAt = new Date();
  const id = createSubmissionId(submittedAt, await takeSubmissionSequence());
  const {
    result: { unfilledFields, values },
  } = await runInPage(
    page.tabId,
    {
      definitionId: form.definitionId,
      index: form.index,
      lead: createLeadData(id),
      selections,
      type: "submit-form",
    },
    isSubmissionResult,
    documentId,
  );
  const unitSelect = form.selects.find(({ unit }) => unit);
  const unit = unitSelect && values[unitSelect.key];
  const record: SubmissionRecord = {
    definitionId: form.definitionId,
    definitionName: form.definitionName,
    formLabel: form.label,
    id,
    pageUrl: page.pageUrl,
    submittedAt: submittedAt.toISOString(),
    ...(isSelectOption(unit) && unit.value !== "" && { unit }),
    values,
  };

  try {
    await addSubmission(record);
  } catch {
    throw new Error(
      "O envio " + id + " foi disparado, mas não foi gravado no histórico.",
    );
  }

  return { record, unfilledFields };
}

async function runInPage<Result>(
  tabId: number,
  command: PageCommand,
  isResult: (result: unknown) => result is Result,
  documentId?: string,
): Promise<PageResult<Result>> {
  const target =
    documentId === undefined ? { tabId } : { documentIds: [documentId], tabId };
  let injected: { documentId?: string; result?: unknown } | undefined;

  try {
    await browser.scripting.executeScript({
      args: [PAGE_COMMAND_KEY, command],
      func: storePageCommand,
      target,
    });
    [injected] = await browser.scripting.executeScript({
      files: ["/lead-forms.js"],
      target,
    });
  } catch {
    throw new Error(
      "Não foi possível acessar esta página. Abra uma página web comum e clique no ícone da extensão para tentar de novo.",
    );
  }

  const response = parsePageResponse(injected?.result, isResult);

  if (!response) {
    throw new Error("A página retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return {
    ...(typeof injected?.documentId === "string" && {
      documentId: injected.documentId,
    }),
    result: response.result,
  };
}

function storePageCommand(key: string, command: PageCommand): void {
  Reflect.set(globalThis, key, command);
}
