import { storage } from "wxt/utils/storage";

import { isSubmissionId } from "@/lib/lead-data";
import { type FilledValues, isFilledValues } from "@/lib/page-command";

export type SubmissionRecord = {
  definitionId: string;
  definitionName: string;
  formLabel: string;
  id: string;
  pageUrl: string;
  submittedAt: string;
  values: FilledValues;
};

export const HISTORY_MAX_RECORDS = 100;
export const HISTORY_RETENTION_DAYS = 30;

const historyItem = storage.defineItem<unknown>("local:submissionHistory");
const sequenceItem = storage.defineItem<unknown>("local:submissionSequence");

export async function addSubmission(record: SubmissionRecord): Promise<void> {
  await historyItem.setValue(
    retainSubmissions([record, ...parseHistory(await historyItem.getValue())]),
  );
}

export async function clearSubmissionHistory(): Promise<void> {
  await historyItem.removeValue();
}

export async function readSubmissionHistory(): Promise<SubmissionRecord[]> {
  const stored = await historyItem.getValue();
  const history = retainSubmissions(parseHistory(stored));

  if (Array.isArray(stored) && stored.length !== history.length) {
    await historyItem.setValue(history);
  }

  return history;
}

export async function takeSubmissionSequence(): Promise<number> {
  const stored = await sequenceItem.getValue();
  const sequence =
    typeof stored === "number" && Number.isInteger(stored) && stored > 0
      ? stored + 1
      : 1;
  await sequenceItem.setValue(sequence);

  return sequence;
}

function isSubmissionRecord(value: unknown): value is SubmissionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record: Record<string, unknown> = { ...value };

  return (
    typeof record.definitionId === "string" &&
    typeof record.definitionName === "string" &&
    typeof record.formLabel === "string" &&
    isSubmissionId(record.id) &&
    typeof record.pageUrl === "string" &&
    typeof record.submittedAt === "string" &&
    !Number.isNaN(Date.parse(record.submittedAt)) &&
    isFilledValues(record.values)
  );
}

function parseHistory(stored: unknown): SubmissionRecord[] {
  return Array.isArray(stored) ? stored.filter(isSubmissionRecord) : [];
}

function retainSubmissions(records: SubmissionRecord[]): SubmissionRecord[] {
  const oldest = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return records
    .filter(({ submittedAt }) => Date.parse(submittedAt) >= oldest)
    .slice(0, HISTORY_MAX_RECORDS);
}
