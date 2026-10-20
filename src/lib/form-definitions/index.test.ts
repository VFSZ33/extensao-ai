import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formDefinitions } from "@/lib/form-definitions";
import { detectForms, runPageCommand } from "@/lib/form-filler";
import { createLeadData } from "@/lib/lead-data";

const fixture = new DOMParser().parseFromString(
  readFileSync(resolve("tests/fixtures/lead-forms.html"), "utf8"),
  "text/html",
);
const lead = createLeadData("LT-20261007-080509-012");
let listeners = new AbortController();

function captureSubmission(): { current?: Record<string, unknown> } {
  const submission: { current?: Record<string, unknown> } = {};

  document.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      if (event.target instanceof HTMLFormElement) {
        const formData = new FormData(event.target);
        submission.current = Object.fromEntries(
          [...new Set(formData.keys())].map((key) => [
            key,
            key.endsWith("[]") ? formData.getAll(key) : formData.get(key),
          ]),
        );
      }
    },
    { signal: listeners.signal },
  );

  return submission;
}

function openContactModal(): void {
  const template = document.getElementById("contact-modal");

  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error("Modal de contato ausente na fixture.");
  }

  document.body.append(template.content.cloneNode(true));
}

describe("Definições de formulário", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture.body.innerHTML;
    listeners = new AbortController();
  });

  afterEach(() => {
    listeners.abort();
  });

  it("reconhece cada formulário suportado e ignora os demais", () => {
    expect(detectForms(document, formDefinitions)).toEqual([
      {
        definitionId: "autodromo-offer",
        definitionName: "Formulário de oferta",
        index: 0,
        label: "oferta - GEELY EX5 PRO - Enviar",
        selects: [],
      },
      {
        definitionId: "autodromo-section",
        definitionName: "Formulário de seção",
        index: 2,
        label: "Título da seção - Enviar",
        selects: [],
      },
      {
        definitionId: "autodromo-offer",
        definitionName: "Formulário de oferta",
        index: 3,
        label: "oferta - GEELY EX2 - Enviar",
        selects: [],
      },
      {
        definitionId: "autodromo-section",
        definitionName: "Formulário de seção",
        index: 4,
        label: "CRETA 1.0 TGDI FLEX COMFORT - Enviar",
        selects: [
          {
            key: "unit",
            label: "Unidade",
            options: [
              { label: "Unidade Afogados", value: "unit-afogados" },
              { label: "Unidade Boa Viagem", value: "unit-boa-viagem" },
              { label: "Unidade Caruaru", value: "unit-caruaru" },
            ],
          },
        ],
      },
    ]);
  });

  it("reconhece o formulário do modal de contato só enquanto ele está aberto", () => {
    openContactModal();

    expect(detectForms(document, formDefinitions)).toHaveLength(5);
    expect(detectForms(document, formDefinitions).at(-1)).toEqual({
      definitionId: "autodromo-contact-modal",
      definitionName: "Formulário de modal de contato",
      index: 5,
      label: "contact-form-modal - Fale por WhatsApp - iniciar conversa",
      selects: [],
    });

    document.querySelector("[data-contact-modal]")?.remove();

    expect(
      detectForms(document, formDefinitions).map(
        ({ definitionId }) => definitionId,
      ),
    ).not.toContain("autodromo-contact-modal");
  });

  it("preenche e envia o formulário do modal de contato", async () => {
    openContactModal();
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-contact-modal",
          index: 5,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        unfilledFields: ["dataPermissions"],
        values: {
          email: lead.email,
          mailing: true,
          name: lead.name,
          phone: lead.phone,
          phoning: true,
          whatsapping: true,
        },
      },
    });
    expect(submission.current).toEqual({
      email: lead.email,
      mailing: "on",
      name: lead.name,
      phone: lead.phone,
      phoning: "on",
      whatsapping: "on",
    });
  });

  it("recusa o envio quando o modal de contato foi fechado", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-contact-modal",
          index: 5,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      error:
        "O formulário escolhido não está mais na página. Atualize a lista.",
      ok: false,
    });
    expect(submission.current).toBeUndefined();
  });

  it("preenche e envia o formulário de oferta", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-offer",
          index: 0,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        unfilledFields: ["dataPermissions"],
        values: {
          cpf: lead.cpf,
          email: lead.email,
          mailing: true,
          name: lead.name,
          phone: lead.phone,
          phoning: true,
          whatsapping: true,
        },
      },
    });
    expect(submission.current).toEqual({
      cpf: lead.cpf,
      email: lead.email,
      mailing: "on",
      name: lead.name,
      phone: lead.phone,
      phoning: "on",
      whatsapping: "on",
    });
  });

  it("recusa o envio quando o formulário exige o consentimento de marketing", async () => {
    const consent = document.querySelector(
      'form[data-fixture="offer"] input[name="dataPermissions"]',
    );

    if (!(consent instanceof HTMLInputElement)) {
      throw new Error("Consentimento ausente na fixture.");
    }

    consent.required = true;
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-offer",
          index: 0,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      error:
        'O formulário exige o consentimento de marketing "dataPermissions". Por política, a extensão não marca consentimento, e o formulário não foi enviado.',
      ok: false,
    });
    expect(consent).not.toBeChecked();
    expect(submission.current).toBeUndefined();
  });

  it("não mapeia as caixas de consentimento de nenhuma definição", () => {
    openContactModal();

    for (const definition of formDefinitions) {
      const forms = Array.from(document.forms).filter(definition.matches);
      const consents = forms.flatMap((form) =>
        definition.consentSelectors.flatMap((selector) =>
          Array.from(form.querySelectorAll(selector)),
        ),
      );
      const mapped = forms.flatMap((form) =>
        definition.fields.flatMap(({ selector }) =>
          Array.from(form.querySelectorAll(selector)),
        ),
      );
      expect(consents.length).toBeGreaterThan(0);
      expect(consents.filter((consent) => mapped.includes(consent))).toEqual(
        [],
      );
    }
  });

  it("preenche a variação de oferta sem os campos opcionais", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-offer",
          index: 3,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        unfilledFields: [],
        values: {
          email: lead.email,
          mailing: true,
          name: lead.name,
          phone: lead.phone,
          phoning: true,
          whatsapping: true,
        },
      },
    });
    expect(submission.current).toMatchObject({ name: lead.name });
  });

  it("preenche e envia o formulário de seção", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-section",
          index: 2,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        unfilledFields: ["marketingConsent[]"],
        values: {
          "contactPreference.email": true,
          "contactPreference.telefone": true,
          "contactPreference.whatsapp": true,
          cpf: lead.cpf,
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
        },
      },
    });
    expect(submission.current).toMatchObject({
      "contactPreference[]": ["email", "whatsapp", "telefone"],
      cpf: lead.cpf,
      email: lead.email,
      name: lead.name,
      phone: lead.phone,
      siteId: "site-fixture",
    });
    expect(submission.current).not.toHaveProperty("marketingConsent[]");
  });

  it("preenche a caixa de mensagem e a opção escolhida no seletor", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-section",
          index: 4,
          lead,
          selections: { unit: "unit-boa-viagem" },
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        unfilledFields: ["bestTime", "marketingConsent[]"],
        values: {
          "contactPreference.email": true,
          "contactPreference.telefone": true,
          "contactPreference.whatsapp": true,
          email: lead.email,
          message: lead.message,
          name: lead.name,
          phone: lead.phone,
          unit: { label: "Unidade Boa Viagem", value: "unit-boa-viagem" },
        },
      },
    });
    expect(submission.current).toMatchObject({
      bestTime: "",
      message: lead.message,
      name: lead.name,
      unit: "unit-boa-viagem",
    });
  });

  it("mantém a opção da página quando nenhuma é escolhida", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-section",
          index: 4,
          lead,
          selections: {},
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        values: { unit: { label: "Selecione a unidade", value: "" } },
      },
    });
    expect(submission.current).toMatchObject({
      message: lead.message,
      unit: "",
    });
  });

  it("recusa o envio quando a opção escolhida não está mais na página", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-section",
          index: 4,
          lead,
          selections: { unit: "unit-olinda" },
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      error:
        'A opção escolhida em "Unidade" não está mais na página. Atualize a lista.',
      ok: false,
    });
    expect(document.forms.item(4)?.elements.namedItem("name")).toHaveValue("");
    expect(submission.current).toBeUndefined();
  });

  it("recusa a escolha para um seletor que o formulário não tem", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-section",
          index: 2,
          lead,
          selections: { unit: "unit-afogados" },
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      error: 'O seletor "unit" não está mais no formulário. Atualize a lista.',
      ok: false,
    });
    expect(submission.current).toBeUndefined();
  });

  it("recusa o envio quando a definição não corresponde ao formulário", async () => {
    const submission = captureSubmission();
    await expect(
      runPageCommand(
        {
          definitionId: "autodromo-section",
          index: 0,
          lead,
          type: "submit-form",
        },
        document,
        formDefinitions,
      ),
    ).resolves.toEqual({
      error:
        "O formulário escolhido não está mais na página. Atualize a lista.",
      ok: false,
    });
    expect(submission.current).toBeUndefined();
  });
});
