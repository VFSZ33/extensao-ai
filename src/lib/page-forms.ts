import { browser } from "wxt/browser";

import { type ActiveTab, getActiveTab } from "@/lib/active-tab";
import { PAGE_COMMAND_LOCK, runExclusive } from "@/lib/exclusive-task";
import { createLeadData, createSubmissionId } from "@/lib/lead-data";
import { readPageAccess } from "@/lib/page-access";
import {
  type FormReturn,
  isFormReturn,
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

export type FormCheck =
  | { form: RecognizedForm; status: "found" }
  | {
      status: "inaccessible" | "inactive" | "missing" | "moved" | "navigating";
    };

export type FormReopen =
  | { form: RecognizedForm; page: PageForms; status: "found" }
  | {
      status:
        | "ambiguous"
        | "cancelled"
        | "denied"
        | "inaccessible"
        | "inactive"
        | "missing"
        | "other-site"
        | "timeout";
    };

export type PageChange = "cancelled" | "changed" | "inactive" | "unchanged";

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

type LoadedTab =
  | { status: "cancelled" | "inactive" | "other-site" | "timeout" }
  | { status: "loaded"; url: string };

type PageResult<Result> = { documentId?: string; result: Result };

type PageTarget = {
  documentId?: string;
  signal?: AbortSignal;
  tabId: number;
  url: string;
};

export const PAGE_COMMAND_TIMEOUT_MS = 30000;
export const PAGE_LOAD_POLL_MS = 250;
export const PAGE_LOAD_TIMEOUT_MS = 15000;

export async function detectPageForms(tab?: ActiveTab): Promise<PageForms> {
  const page = tab ?? (await getActiveTab());
  const { documentId, result } = await runInPage(
    { tabId: page.id, url: page.url },
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
  signal?: AbortSignal,
): Promise<FormCheck> {
  if (page.documentId === undefined) {
    return { status: "inaccessible" };
  }

  try {
    const tab = await browser.tabs.get(page.tabId);

    if (!tab.active) {
      return { status: "inactive" };
    }

    if (tab.pendingUrl) {
      return { status: "navigating" };
    }

    if (tab.url !== page.pageUrl) {
      return { status: "moved" };
    }

    const { result } = await runInPage(
      {
        documentId: page.documentId,
        signal,
        tabId: page.tabId,
        url: page.pageUrl,
      },
      { type: "detect-forms" },
      isRecognizedForms,
    );
    const current = result.find((candidate) => isSameForm(candidate, form));

    return current ? { form: current, status: "found" } : { status: "missing" };
  } catch {
    return { status: "inaccessible" };
  }
}

export function isSameForm(
  candidate: RecognizedForm,
  form: RecognizedForm,
): boolean {
  return candidate.index === form.index && hasSameIdentity(candidate, form);
}

export async function reopenFormPage(
  page: PageForms,
  form: RecognizedForm,
  signal?: AbortSignal,
): Promise<FormReopen> {
  const origin = readOrigin(page.pageUrl);
  let loaded = await waitForLoadedTab(page.tabId, origin, signal);

  if (loaded.status === "loaded" && loaded.url !== page.pageUrl) {
    try {
      await browser.tabs.update(page.tabId, { url: page.pageUrl });
    } catch {
      return { status: "inactive" };
    }

    loaded = await waitForLoadedTab(page.tabId, origin, signal, page.pageUrl);
  }

  if (loaded.status !== "loaded") {
    return { status: loaded.status };
  }

  const target = { signal, tabId: page.tabId, url: page.pageUrl };
  let detected: PageResult<RecognizedForm[]>;

  try {
    detected = await runInPage(
      target,
      { type: "detect-forms" },
      isRecognizedForms,
    );
  } catch {
    const access = await guardPageCommand(target, () =>
      readPageAccess(page.tabId, page.pageUrl),
    ).catch(() => undefined);

    return {
      status: signal?.aborted
        ? "cancelled"
        : access === "granted"
          ? "inaccessible"
          : "denied",
    };
  }

  const { documentId, result } = detected;
  const twins = result.filter((candidate) => hasSameIdentity(candidate, form));
  const current = twins.find(({ index }) => index === form.index);

  if (documentId === undefined) {
    return { status: "inaccessible" };
  }

  if (twins.length === 0) {
    return { status: "missing" };
  }

  if (
    !current ||
    twins.length !==
      page.forms.filter((candidate) => hasSameIdentity(candidate, form)).length
  ) {
    return { status: "ambiguous" };
  }

  return {
    form: current,
    page: {
      documentId,
      forms: result,
      pageUrl: page.pageUrl,
      tabId: page.tabId,
    },
    status: "found",
  };
}

export async function returnToForm(
  page: PageForms,
  form: RecognizedForm,
  signal?: AbortSignal,
): Promise<FormReturn> {
  if (page.documentId === undefined) {
    return "unknown-form";
  }

  const { result } = await runInPage(
    {
      documentId: page.documentId,
      signal,
      tabId: page.tabId,
      url: page.pageUrl,
    },
    {
      definitionId: form.definitionId,
      index: form.index,
      type: "return-to-form",
    },
    isFormReturn,
  );

  return result;
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
    { documentId, tabId: page.tabId, url: page.pageUrl },
    {
      definitionId: form.definitionId,
      index: form.index,
      lead: createLeadData(id),
      selections,
      type: "submit-form",
    },
    isSubmissionResult,
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

export async function waitForPageChange(
  page: Pick<PageForms, "pageUrl" | "tabId">,
  timeout: number,
  signal?: AbortSignal,
): Promise<PageChange> {
  for (let waited = 0; ; waited += PAGE_LOAD_POLL_MS) {
    if (signal?.aborted) {
      return "cancelled";
    }

    const tab = await browser.tabs.get(page.tabId).catch(() => undefined);

    if (!tab?.active) {
      return "inactive";
    }

    if (tab.pendingUrl || tab.url !== page.pageUrl) {
      return "changed";
    }

    if (waited >= timeout) {
      return "unchanged";
    }

    await wait(PAGE_LOAD_POLL_MS);
  }
}

function guardPageCommand<Result>(
  { signal, tabId, url }: PageTarget,
  task: () => Promise<Result>,
): Promise<Result> {
  let stop = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "A página não respondeu em " +
            String(PAGE_COMMAND_TIMEOUT_MS / 1000) +
            " s.",
        ),
      );
    }, PAGE_COMMAND_TIMEOUT_MS);

    function handleAbort() {
      reject(new Error("A ação na página foi cancelada."));
    }

    function handleRemoved(removedTabId: number) {
      if (removedTabId === tabId) {
        reject(new Error("A aba foi fechada antes de a página responder."));
      }
    }

    function handleUpdated(updatedTabId: number, change: { url?: string }) {
      if (
        updatedTabId === tabId &&
        change.url !== undefined &&
        removeHash(change.url) !== removeHash(url)
      ) {
        reject(new Error("A página mudou de endereço antes de responder."));
      }
    }

    stop = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      browser.tabs.onRemoved.removeListener(handleRemoved);
      browser.tabs.onUpdated.removeListener(handleUpdated);
    };
    browser.tabs.onRemoved.addListener(handleRemoved);
    browser.tabs.onUpdated.addListener(handleUpdated);

    if (signal?.aborted) {
      handleAbort();
    } else {
      signal?.addEventListener("abort", handleAbort, { once: true });
    }
  });

  return Promise.race([task(), interrupted]).finally(() => {
    stop();
  });
}

function hasSameIdentity(
  candidate: RecognizedForm,
  form: RecognizedForm,
): boolean {
  const marks = Object.entries(form.marks);

  return (
    candidate.definitionId === form.definitionId &&
    candidate.label === form.label &&
    Object.keys(candidate.marks).length === marks.length &&
    marks.every(([name, value]) => candidate.marks[name] === value)
  );
}

function readOrigin(url: string): string | undefined {
  return URL.canParse(url) ? new URL(url).origin : undefined;
}

function removeHash(url: string): string {
  const hash = url.indexOf("#");

  return hash === -1 ? url : url.slice(0, hash);
}

function runInPage<Result>(
  page: PageTarget,
  command: PageCommand,
  isResult: (result: unknown) => result is Result,
): Promise<PageResult<Result>> {
  const { documentId, tabId } = page;

  return runExclusive(PAGE_COMMAND_LOCK + ":" + tabId, async () => {
    const target =
      documentId === undefined
        ? { tabId }
        : { documentIds: [documentId], tabId };
    const injected = await guardPageCommand(page, async () => {
      try {
        await browser.scripting.executeScript({
          args: [PAGE_COMMAND_KEY, command],
          func: storePageCommand,
          target,
        });
        const [result] = await browser.scripting.executeScript({
          files: ["/lead-forms.js"],
          target,
        });

        return result;
      } catch {
        throw new Error(
          "Não foi possível acessar esta página. Abra uma página web comum e clique no ícone da extensão para tentar de novo.",
        );
      }
    });

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
  });
}

function storePageCommand(key: string, command: PageCommand): void {
  Reflect.set(globalThis, key, command);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForLoadedTab(
  tabId: number,
  origin: string | undefined,
  signal?: AbortSignal,
  url?: string,
): Promise<LoadedTab> {
  for (let waited = 0; ; waited += PAGE_LOAD_POLL_MS) {
    if (signal?.aborted) {
      return { status: "cancelled" };
    }

    const tab = await browser.tabs.get(tabId).catch(() => undefined);

    if (!tab?.active) {
      return { status: "inactive" };
    }

    const address = tab.pendingUrl || tab.url;

    if (address && readOrigin(address) !== origin) {
      return { status: "other-site" };
    }

    if (
      tab.status === "complete" &&
      !tab.pendingUrl &&
      tab.url &&
      (url === undefined || tab.url === url)
    ) {
      return { status: "loaded", url: tab.url };
    }

    if (waited >= PAGE_LOAD_TIMEOUT_MS) {
      return { status: "timeout" };
    }

    await wait(PAGE_LOAD_POLL_MS);
  }
}
