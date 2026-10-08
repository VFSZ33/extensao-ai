import type { FormDefinition } from "@/lib/form-definition";

export const autodromoContactModalForm: FormDefinition = {
  fields: [
    {
      key: "dataPermissions",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="dataPermissions"]',
    },
    {
      comparison: "exact",
      key: "email",
      kind: "text",
      selector: 'input[name="email"]',
      source: "email",
    },
    {
      key: "mailing",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="mailing"]',
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
      selector: 'input[name="phone"]',
      source: "phone",
    },
    {
      key: "phoning",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="phoning"]',
    },
    {
      key: "whatsapping",
      kind: "checkbox",
      optional: true,
      selector: 'input[name="whatsapping"]',
    },
  ],
  id: "autodromo-contact-modal",
  matches: (form) => form.matches('[data-gtag-label^="contact-form-modal"]'),
  name: "Formulário de modal de contato",
  submitSelector: 'button[type="submit"]',
};
