import { describe, expect, it } from "vitest";

import {
  createLeadData,
  createSubmissionId,
  findSubmissionId,
  isSubmissionId,
} from "@/lib/lead-data";

function hasValidCpfCheckDigits(cpf: string): boolean {
  const digits = [...cpf].map(Number);

  return [9, 10].every((length) => {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);

    return ((sum * 10) % 11) % 10 === digits[length];
  });
}

describe("Dados do lead de teste", () => {
  it("gera o identificador a partir da data, da hora e da sequência", () => {
    expect(createSubmissionId(new Date(2026, 9, 7, 8, 5, 9), 12)).toBe(
      "LT-20261007-080509-012",
    );
    expect(createSubmissionId(new Date(2026, 0, 31, 23, 59, 59), 1234)).toBe(
      "LT-20260131-235959-1234",
    );
  });

  it.each([0, -1, 1.5, Number.NaN])("rejeita a sequência %j", (sequence) => {
    expect(() => createSubmissionId(new Date(2026, 9, 7), sequence)).toThrow(
      "Não foi possível gerar o identificador do envio.",
    );
  });

  it("rejeita uma data inválida", () => {
    expect(() => createSubmissionId(new Date(Number.NaN), 1)).toThrow(
      "Não foi possível gerar o identificador do envio.",
    );
  });

  it("reconstrói os mesmos valores a partir do identificador", () => {
    const lead = createLeadData("LT-20261007-080509-012");
    expect(createLeadData("LT-20261007-080509-012")).toEqual(lead);
    expect(lead).toEqual({
      cpf: expect.stringMatching(/^\d{11}$/),
      email: "lt-20261007-080509-012@example.com",
      message: "Lead de teste LT-20261007-080509-012.",
      name: "Teste LT-20261007-080509-012",
      phone: expect.stringMatching(/^209[6-9]\d{7}$/),
    });
  });

  it("gera valores diferentes para identificadores diferentes", () => {
    const first = createLeadData("LT-20261007-080509-012");
    const second = createLeadData("LT-20261007-080509-013");
    expect(second.cpf).not.toBe(first.cpf);
    expect(second.email).not.toBe(first.email);
    expect(second.name).not.toBe(first.name);
    expect(second.phone).not.toBe(first.phone);
  });

  it("gera CPF com dígitos verificadores válidos e sem repetição única", () => {
    for (let sequence = 1; sequence <= 500; sequence += 1) {
      const { cpf } = createLeadData(
        createSubmissionId(new Date(2026, 9, 7, 8, 5, 9), sequence),
      );
      expect(hasValidCpfCheckDigits(cpf)).toBe(true);
      expect(cpf).not.toMatch(/^(\d)\1{10}$/);
    }
  });

  it("gera sempre celular com o DDD 20, que não existe no Brasil", () => {
    for (let sequence = 1; sequence <= 500; sequence += 1) {
      const { phone } = createLeadData(
        createSubmissionId(new Date(2026, 9, 7, 8, 5, 9), sequence),
      );
      expect(phone).toMatch(/^209[6-9]\d{7}$/);
    }
  });

  it("encontra o identificador no nome e no e-mail gerados", () => {
    const lead = createLeadData("LT-20261007-080509-012");
    expect(findSubmissionId(lead.name)).toBe("LT-20261007-080509-012");
    expect(findSubmissionId(lead.email)).toBe("LT-20261007-080509-012");
    expect(findSubmissionId(lead.message)).toBe("LT-20261007-080509-012");
    expect(findSubmissionId("LT-20260131-235959-1234")).toBe(
      "LT-20260131-235959-1234",
    );
  });

  it.each(["", "Bruna Exemplo", "lt-2026-1@example.com", "LT-20261007-080509"])(
    "não encontra identificador em %j",
    (text) => {
      expect(findSubmissionId(text)).toBeUndefined();
    },
  );

  it.each([undefined, null, 12, "", "LT-2026-1", "teste"])(
    "rejeita o identificador inválido %j",
    (submissionId) => {
      expect(isSubmissionId(submissionId)).toBe(false);
      expect(() => createLeadData(String(submissionId))).toThrow(
        "Identificador de envio inválido.",
      );
    },
  );
});
