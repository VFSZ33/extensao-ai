import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormDefinition } from "@/lib/form-definition";

import {
  detectForms,
  fillAndSubmitForm,
  runPageCommand,
} from "@/lib/form-filler";
import { createLeadData } from "@/lib/lead-data";

type ControlledFormProps = {
  onSubmit: (data: Record<string, FormDataEntryValue>) => void;
  phoneDigits?: number;
  requiredNotes?: boolean;
  submitDisabled?: boolean;
};

const definition: FormDefinition = {
  fields: [
    {
      comparison: "exact",
      key: "message",
      kind: "text",
      optional: true,
      selector: 'textarea[name="message"]',
      source: "message",
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
    { key: "terms", kind: "checkbox", selector: 'input[name="terms"]' },
  ],
  id: "controlled",
  matches: (form) => form.querySelector('input[name="terms"]') !== null,
  name: "Formulário controlado",
  submitSelector: 'button[type="submit"]',
};
const lead = createLeadData("LT-20261007-080509-012");
const maskedPhone =
  "(" +
  lead.phone.slice(0, 2) +
  ") " +
  lead.phone.slice(2, 7) +
  "-" +
  lead.phone.slice(7);

function ControlledForm({
  onSubmit,
  phoneDigits = 11,
  requiredNotes = false,
  submitDisabled = false,
}: ControlledFormProps) {
  const [accepted, setAccepted] = useState(false);
  const [phone, setPhone] = useState("");

  return (
    <form
      aria-label="Contato"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
      }}
    >
      <input name="name" />
      <input
        name="phone"
        onChange={(event) =>
          setPhone(
            event.target.value
              .replace(/\D/g, "")
              .slice(0, phoneDigits)
              .replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3"),
          )
        }
        value={phone}
      />
      <input
        checked={accepted}
        name="terms"
        onChange={(event) => setAccepted(event.target.checked)}
        type="checkbox"
      />
      {requiredNotes && <textarea name="notes" required />}
      <button disabled={submitDisabled} type="submit">
        Enviar
      </button>
    </form>
  );
}

function getForm(): HTMLFormElement {
  const form = screen.getByRole("form", { name: "Contato" });

  if (!(form instanceof HTMLFormElement)) {
    throw new Error("Formulário de teste não encontrado.");
  }

  return form;
}

describe("Preenchimento de formulário", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("preenche campos controlados pelo React, com máscara, e envia", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).resolves.toEqual({ name: lead.name, phone: maskedPhone, terms: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: lead.name,
      phone: maskedPhone,
      terms: "on",
    });
  });

  it("não envia quando um campo não aceita o valor", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} phoneDigits={10} />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).rejects.toThrow('O campo "phone" não aceitou o valor de teste.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não preenche nem envia quando falta um campo da definição", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} />);
    await expect(
      act(() =>
        fillAndSubmitForm(
          getForm(),
          {
            ...definition,
            fields: [
              ...definition.fields,
              {
                comparison: "digits",
                key: "cpf",
                kind: "text",
                selector: 'input[name="cpf"]',
                source: "cpf",
              },
            ],
          },
          lead,
        ),
      ),
    ).rejects.toThrow('Campo "cpf" da definição não encontrado no formulário.');
    expect(getForm().elements.namedItem("name")).toHaveValue("");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não envia quando o formulário exige um campo que a definição não preenche", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} requiredNotes />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).rejects.toThrow(
      'O formulário exige o campo "notes", que a definição não preenche.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não envia quando o botão de envio está desabilitado ou ausente", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} submitDisabled />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).rejects.toThrow("O botão de envio está desabilitado.");
    await expect(
      act(() =>
        fillAndSubmitForm(
          getForm(),
          { ...definition, submitSelector: "button.missing" },
          lead,
        ),
      ),
    ).rejects.toThrow("Botão de envio da definição não encontrado.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("descreve o formulário pelo rótulo próprio ou pelo título mais próximo", () => {
    document.body.innerHTML =
      '<form data-gtag-label=" Oferta A "><input name="terms" /></form>' +
      '<form aria-label="Contato"><input name="terms" /></form>' +
      '<section><h2>Fale conosco</h2><div><form><input name="terms" /></form></div></section>' +
      "<form><input name='other' /></form>";
    expect(
      detectForms(document, [definition]).map(({ index, label }) => [
        index,
        label,
      ]),
    ).toEqual([
      [0, "Oferta A"],
      [1, "Contato"],
      [2, "Fale conosco"],
    ]);
    document.body.innerHTML = '<form><input name="terms" /></form>';
    expect(detectForms(document, [definition])[0]?.label).toBe("");
  });

  it.each([
    undefined,
    null,
    "detect-forms",
    {},
    { type: "other" },
    { definitionId: "controlled", index: 0, type: "submit-form" },
    { definitionId: "controlled", index: "0", lead, type: "submit-form" },
  ])("rejeita o comando inválido %j", async (command) => {
    await expect(
      runPageCommand(command, document, [definition]),
    ).resolves.toEqual({ error: "Comando não suportado.", ok: false });
  });

  it("devolve o erro do preenchimento como resposta do comando", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} submitDisabled />);
    await expect(
      act(() =>
        runPageCommand(
          { definitionId: "controlled", index: 0, lead, type: "submit-form" },
          document,
          [definition],
        ),
      ),
    ).resolves.toEqual({
      error: "O botão de envio está desabilitado.",
      ok: false,
    });
  });
});
