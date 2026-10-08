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

const historyItem = storage.defineItem<unknown>("local:submissionHistory");
const sequenceItem = storage.defineItem<unknown>("local:submissionSequence");

export async function addSubmission(record: SubmissionRecord): Promise<void> {
  await historyItem.setValue([record, ...(await readSubmissionHistory())]);
}

export async function readSubmissionHistory(): Promise<SubmissionRecord[]> {
  const stored = await historyItem.getValue();

  return Array.isArray(stored) ? stored.filter(isSubmissionRecord) : [];
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
