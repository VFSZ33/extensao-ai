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
      },
      {
        definitionId: "autodromo-section",
        definitionName: "Formulário de seção",
        index: 2,
        label: "Título da seção - Enviar",
      },
      {
        definitionId: "autodromo-offer",
        definitionName: "Formulário de oferta",
        index: 3,
        label: "oferta - GEELY EX2 - Enviar",
      },
    ]);
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
        cpf: lead.cpf,
        dataPermissions: true,
        email: lead.email,
        mailing: true,
        name: lead.name,
        phone: lead.phone,
        phoning: true,
        whatsapping: true,
      },
    });
    expect(submission.current).toEqual({
      cpf: lead.cpf,
      dataPermissions: "on",
      email: lead.email,
      mailing: "on",
      name: lead.name,
      phone: lead.phone,
      phoning: "on",
      whatsapping: "on",
    });
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
        email: lead.email,
        mailing: true,
        name: lead.name,
        phone: lead.phone,
        phoning: true,
        whatsapping: true,
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
        "contactPreference.email": true,
        "contactPreference.telefone": true,
        "contactPreference.whatsapp": true,
        cpf: lead.cpf,
        email: lead.email,
        marketingConsent: true,
        name: lead.name,
        phone: lead.phone,
      },
    });
    expect(submission.current).toMatchObject({
      "contactPreference[]": ["email", "whatsapp", "telefone"],
      cpf: lead.cpf,
      email: lead.email,
      "marketingConsent[]": ["true"],
      name: lead.name,
      phone: lead.phone,
      siteId: "site-fixture",
    });
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
