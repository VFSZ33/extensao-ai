import type { FormDefinition } from "@/lib/form-definition";

export const autodromoSectionForm: FormDefinition = {
  fields: [
    {
      key: "contactPreference.email",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="contactPreference[]"][value="email"]',
    },
    {
      key: "contactPreference.telefone",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="contactPreference[]"][value="telefone"]',
    },
    {
      key: "contactPreference.whatsapp",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="contactPreference[]"][value="whatsapp"]',
    },
    {
      comparison: "digits",
      key: "cpf",
      kind: "text",
      optional: true,
      selector: 'input[name="cpf"]',
      source: "cpf",
    },
    {
      comparison: "exact",
      key: "email",
      kind: "text",
      selector: 'input[name="email"]',
      source: "email",
    },
    {
      key: "marketingConsent",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="marketingConsent[]"]',
    },
    {
      comparison: "exact",
      key: "name",
      kind: "text",
      selector: 'input[name="name"]',
      source: "name",
    },
    {
      comparison: "digits",
      key: "phone",
      kind: "text",
      optional: true,
      selector: 'input[name="phone"]',
      source: "phone",
    },
  ],
  id: "autodromo-section",
  matches: (form) =>
    form.querySelector('input[type="hidden"][name="origin_url"]') !== null &&
    form.querySelector('input[type="hidden"][name="siteId"]') !== null,
  name: "Formulário de seção",
  submitSelector: 'button[type="submit"]',
};
