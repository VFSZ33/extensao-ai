export type LeadData = {
  cpf: string;
  email: string;
  message: string;
  name: string;
  phone: string;
};

const SUBMISSION_ID_FORMAT = "LT-\\d{8}-\\d{6}-\\d{3,}";
const SUBMISSION_ID_PATTERN = new RegExp("^" + SUBMISSION_ID_FORMAT + "$");
const SUBMISSION_ID_SEARCH = new RegExp(SUBMISSION_ID_FORMAT, "i");
const TEST_PHONE_AREA_CODE = "20";

export function createLeadData(submissionId: string): LeadData {
  if (!isSubmissionId(submissionId)) {
    throw new Error("Identificador de envio inválido.");
  }

  const nextDigit = createDigitGenerator(submissionId);
  const cpfBase = Array.from({ length: 9 }, () => nextDigit(10));

  if (cpfBase.every((digit) => digit === cpfBase[0])) {
    cpfBase[8] = ((cpfBase[8] ?? 0) + 1) % 10;
  }

  const firstCheckDigit = createCpfCheckDigit(cpfBase);
  const secondCheckDigit = createCpfCheckDigit([...cpfBase, firstCheckDigit]);
  const phoneSuffix = Array.from({ length: 7 }, () => nextDigit(10));

  return {
    cpf: [...cpfBase, firstCheckDigit, secondCheckDigit].join(""),
    email: submissionId.toLowerCase() + "@example.com",
    message: "Lead de teste " + submissionId + ".",
    name: "Teste " + submissionId,
    phone: [TEST_PHONE_AREA_CODE, 9, 6 + nextDigit(4), ...phoneSuffix].join(""),
  };
}

export function createSubmissionId(date: Date, sequence: number): string {
  if (
    Number.isNaN(date.getTime()) ||
    !Number.isInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error("Não foi possível gerar o identificador do envio.");
  }

  return [
    "LT",
    pad(date.getFullYear(), 4) +
      pad(date.getMonth() + 1, 2) +
      pad(date.getDate(), 2),
    pad(date.getHours(), 2) +
      pad(date.getMinutes(), 2) +
      pad(date.getSeconds(), 2),
    pad(sequence, 3),
  ].join("-");
}

export function findSubmissionId(text: string): string | undefined {
  return SUBMISSION_ID_SEARCH.exec(text)?.[0].toUpperCase();
}

export function isSubmissionId(value: unknown): value is string {
  return typeof value === "string" && SUBMISSION_ID_PATTERN.test(value);
}

function createCpfCheckDigit(digits: number[]): number {
  const sum = digits.reduce(
    (total, digit, index) => total + digit * (digits.length + 1 - index),
    0,
  );
  const remainder = (sum * 10) % 11;

  return remainder === 10 ? 0 : remainder;
}

function createDigitGenerator(seed: string): (limit: number) => number {
  let state = 2166136261;

  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }

  return (limit) => {
    state = (state + 1831565813) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * limit);
  };
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}
