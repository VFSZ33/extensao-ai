import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import {
  addSubmission,
  clearSubmissionHistory,
  readSubmissionHistory,
  type SubmissionRecord,
  takeSubmissionSequence,
} from "@/lib/submission-history";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-08T12:00:00.000Z");

function createRecord(
  id: string,
  submittedAt = "2026-10-07T11:05:09.000Z",
): SubmissionRecord {
  return {
    definitionId: "autodromo-offer",
    definitionName: "Formulário de oferta",
    formLabel: "oferta - GEELY EX5 PRO - Enviar",
    id,
    pageUrl: "https://example.com/",
    submittedAt,
    values: { name: "Teste " + id, whatsapping: true },
  };
}

describe("Histórico de envios", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
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

  it("lê registros com e sem a opção de um seletor", async () => {
    const withSelect = {
      ...createRecord("LT-20261008-090000-002"),
      values: { unit: { label: "Unidade Norte", value: "north" } },
    };
    await browser.storage.local.set({
      submissionHistory: [withSelect, createRecord("LT-20261007-080509-001")],
    });
    await expect(readSubmissionHistory()).resolves.toEqual([
      withSelect,
      createRecord("LT-20261007-080509-001"),
    ]);
  });

  it("descarta registros armazenados em formato inválido", async () => {
    await browser.storage.local.set({
      submissionHistory: [
        null,
        "LT-20261007-080509-001",
        { ...createRecord("LT-20261007-080509-001"), id: "outro" },
        { ...createRecord("LT-20261007-080509-001"), submittedAt: "ontem" },
        { ...createRecord("LT-20261007-080509-001"), values: { name: 1 } },
        {
          ...createRecord("LT-20261007-080509-001"),
          values: { unit: { label: "Unidade Norte" } },
        },
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

  it("descarta ao gravar os envios com mais de 30 dias", async () => {
    const limit = new Date(NOW.getTime() - 30 * DAY_MS).toISOString();
    const expired = new Date(NOW.getTime() - 30 * DAY_MS - 1).toISOString();
    await browser.storage.local.set({
      submissionHistory: [
        createRecord("LT-20260908-120000-002", limit),
        createRecord("LT-20260908-115959-001", expired),
      ],
    });
    await addSubmission(createRecord("LT-20261008-090000-003"));
    await expect(
      browser.storage.local.get("submissionHistory"),
    ).resolves.toEqual({
      submissionHistory: [
        createRecord("LT-20261008-090000-003"),
        createRecord("LT-20260908-120000-002", limit),
      ],
    });
  });

  it("descarta ao ler os envios vencidos e os registros inválidos, também no armazenamento", async () => {
    const expired = new Date(NOW.getTime() - 31 * DAY_MS).toISOString();
    await browser.storage.local.set({
      submissionHistory: [
        createRecord("LT-20261007-080509-002"),
        null,
        createRecord("LT-20260907-080509-001", expired),
      ],
    });
    await expect(readSubmissionHistory()).resolves.toEqual([
      createRecord("LT-20261007-080509-002"),
    ]);
    await expect(
      browser.storage.local.get("submissionHistory"),
    ).resolves.toEqual({
      submissionHistory: [createRecord("LT-20261007-080509-002")],
    });
  });

  it("guarda no máximo os 100 envios mais recentes", async () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      createRecord(
        "LT-20261007-080509-" + String(100 - index).padStart(3, "0"),
      ),
    );
    await browser.storage.local.set({ submissionHistory: records });
    await expect(readSubmissionHistory()).resolves.toHaveLength(100);
    await addSubmission(createRecord("LT-20261008-090000-101"));
    const history = await readSubmissionHistory();
    expect(history).toHaveLength(100);
    expect(history[0]).toEqual(createRecord("LT-20261008-090000-101"));
    expect(history.at(-1)).toEqual(records.at(-2));
    await browser.storage.local.set({
      submissionHistory: [createRecord("LT-20261008-090000-102"), ...records],
    });
    await expect(readSubmissionHistory()).resolves.toHaveLength(100);
    await expect(
      browser.storage.local.get("submissionHistory"),
    ).resolves.toEqual({
      submissionHistory: [
        createRecord("LT-20261008-090000-102"),
        ...records.slice(0, 99),
      ],
    });
  });

  it("limpa o histórico sem reiniciar a sequência dos identificadores", async () => {
    await expect(takeSubmissionSequence()).resolves.toBe(1);
    await addSubmission(createRecord("LT-20261007-080509-001"));
    await clearSubmissionHistory();
    await expect(readSubmissionHistory()).resolves.toEqual([]);
    await expect(
      browser.storage.local.get("submissionHistory"),
    ).resolves.toEqual({});
    await expect(takeSubmissionSequence()).resolves.toBe(2);
  });
});
