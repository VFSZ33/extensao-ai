import { beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import {
  addSubmission,
  readSubmissionHistory,
  type SubmissionRecord,
  takeSubmissionSequence,
} from "@/lib/submission-history";

function createRecord(id: string): SubmissionRecord {
  return {
    definitionId: "autodromo-offer",
    definitionName: "Formulário de oferta",
    formLabel: "oferta - GEELY EX5 PRO - Enviar",
    id,
    pageUrl: "https://example.com/",
    submittedAt: "2026-10-07T11:05:09.000Z",
    values: { name: "Teste " + id, whatsapping: true },
  };
}

describe("Histórico de envios", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("começa vazio e guarda os envios do mais recente para o mais antigo", async () => {
    await expect(readSubmissionHistory()).resolves.toEqual([]);
    await addSubmission(createRecord("LT-20261007-080509-001"));
    await addSubmission(createRecord("LT-20261007-080510-002"));
    await expect(readSubmissionHistory()).resolves.toEqual([
      createRecord("LT-20261007-080510-002"),
      createRecord("LT-20261007-080509-001"),
    ]);
  });

  it("grava no armazenamento local da extensão", async () => {
    await addSubmission(createRecord("LT-20261007-080509-001"));
    await expect(
      browser.storage.local.get("submissionHistory"),
    ).resolves.toEqual({
      submissionHistory: [createRecord("LT-20261007-080509-001")],
    });
  });

  it("descarta registros armazenados em formato inválido", async () => {
    await browser.storage.local.set({
      submissionHistory: [
        null,
        "LT-20261007-080509-001",
        { ...createRecord("LT-20261007-080509-001"), id: "outro" },
        { ...createRecord("LT-20261007-080509-001"), submittedAt: "ontem" },
        { ...createRecord("LT-20261007-080509-001"), values: { name: 1 } },
        createRecord("LT-20261007-080509-002"),
      ],
    });
    await expect(readSubmissionHistory()).resolves.toEqual([
      createRecord("LT-20261007-080509-002"),
    ]);
    await browser.storage.local.set({ submissionHistory: "inválido" });
    await expect(readSubmissionHistory()).resolves.toEqual([]);
  });

  it("entrega uma sequência crescente que persiste entre leituras", async () => {
    await expect(takeSubmissionSequence()).resolves.toBe(1);
    await expect(takeSubmissionSequence()).resolves.toBe(2);
    await expect(
      browser.storage.local.get("submissionSequence"),
    ).resolves.toEqual({ submissionSequence: 2 });
    await browser.storage.local.set({ submissionSequence: "inválida" });
    await expect(takeSubmissionSequence()).resolves.toBe(1);
  });
});
