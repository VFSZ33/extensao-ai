import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormDefinition } from "@/lib/form-definition";

import {
  detectForms,
  fillAndSubmitForm,
  runPageCommand,
} from "@/lib/form-filler";
import { createLeadData } from "@/lib/lead-data";

type ControlledFormProps = {
  detailed?: boolean;
  frozenUnit?: boolean;
  onSubmit: (data: Record<string, FormDataEntryValue>) => void;
  phoneDigits?: number;
  requiredNotes?: boolean;
  revertingName?: boolean;
  submitDisabled?: boolean;
};

const definition: FormDefinition = {
  consentSelectors: [],
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
    {
      key: "unit",
      kind: "select",
      label: "Unidade",
      optional: true,
      selector: 'select[name="unit"]',
    },
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
  detailed = false,
  frozenUnit = false,
  onSubmit,
  phoneDigits = 11,
  requiredNotes = false,
  revertingName = false,
  submitDisabled = false,
}: ControlledFormProps) {
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [unit, setUnit] = useState("");

  return (
    <form
      aria-label="Contato"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
      }}
    >
      <input
        name="name"
        onChange={(event) => {
          setName(event.target.value);

          if (revertingName) {
            setTimeout(() => {
              flushSync(() => setName(""));
            }, 50);
          }
        }}
        value={name}
      />
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
      {detailed && (
        <>
          <textarea
            name="message"
            onChange={(event) => setMessage(event.target.value)}
            value={message}
          />
          <select
            name="unit"
            onChange={(event) => {
              if (!frozenUnit) {
                setUnit(event.target.value);
              }
            }}
            value={unit}
          >
            <option value="">Selecione a unidade</option>
            <option value="north">Unidade Norte</option>
            <option value="south">Unidade Sul</option>
          </select>
          <input name="city" />
          <input name="color" type="radio" value="blue" />
          <input name="color" type="radio" value="red" />
          <input name="newsletter" type="checkbox" />
          <input defaultValue="" name="campaign" type="hidden" />
          <input name="code" readOnly />
          <input disabled name="coupon" />
        </>
      )}
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
    ).resolves.toEqual({
      unfilledFields: [],
      values: { name: lead.name, phone: maskedPhone, terms: true },
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: lead.name,
      phone: maskedPhone,
      terms: "on",
    });
  });

  it("preenche a caixa de texto e escolhe a opção do seletor controlados pelo React", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm detailed onSubmit={onSubmit} />);
    await expect(
      act(() =>
        fillAndSubmitForm(getForm(), definition, lead, { unit: "south" }),
      ),
    ).resolves.toMatchObject({
      values: {
        message: lead.message,
        unit: { label: "Unidade Sul", value: "south" },
      },
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ message: lead.message, unit: "south" }),
    );
  });

  it("dispara em cada campo a sequência de eventos de quem digita e sai do campo", async () => {
    const events: string[] = [];
    render(<ControlledForm detailed onSubmit={vi.fn()} />);
    const form = getForm();

    for (const type of [
      "blur",
      "change",
      "focus",
      "focusin",
      "focusout",
      "input",
    ]) {
      form.addEventListener(
        type,
        (event) => {
          if (
            event.target instanceof HTMLElement &&
            !(
              event.target instanceof HTMLInputElement &&
              event.target.type === "checkbox"
            )
          ) {
            events.push(event.target.getAttribute("name") + ":" + type);
          }
        },
        true,
      );
    }

    await act(() =>
      fillAndSubmitForm(form, definition, lead, { unit: "south" }),
    );
    expect(events).toEqual(
      ["message", "name", "phone", "unit"].flatMap((name) =>
        ["focus", "focusin", "input", "change", "blur", "focusout"].map(
          (type) => name + ":" + type,
        ),
      ),
    );
  });

  it("deixa o seletor como a página o apresenta quando nenhuma opção é escolhida", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm detailed onSubmit={onSubmit} />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).resolves.toMatchObject({
      values: { unit: { label: "Selecione a unidade", value: "" } },
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ message: lead.message, unit: "" }),
    );
  });

  it("avisa quais campos editáveis ficaram sem preenchimento, sem bloquear o envio", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm detailed onSubmit={onSubmit} />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).resolves.toMatchObject({
      unfilledFields: ["city", "color", "newsletter"],
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("não envia quando o seletor não aceita a opção ou ela não existe", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm detailed frozenUnit onSubmit={onSubmit} />);
    await expect(
      act(() =>
        fillAndSubmitForm(getForm(), definition, lead, { unit: "south" }),
      ),
    ).rejects.toThrow('O seletor "Unidade" não aceitou a opção escolhida.');
    await expect(
      act(() =>
        fillAndSubmitForm(getForm(), definition, lead, { unit: "west" }),
      ),
    ).rejects.toThrow(
      'A opção escolhida em "Unidade" não está mais na página. Atualize a lista.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não envia quando um campo não aceita o valor", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} phoneDigits={10} />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).rejects.toThrow('O campo "phone" não aceitou o valor de teste.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não envia quando a página reverte o valor num render posterior", async () => {
    const onSubmit = vi.fn();
    render(<ControlledForm onSubmit={onSubmit} revertingName />);
    await expect(
      act(() => fillAndSubmitForm(getForm(), definition, lead)),
    ).rejects.toThrow('O campo "name" não aceitou o valor de teste.');
    expect(getForm().elements.namedItem("name")).toHaveValue("");
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
    {
      definitionId: "controlled",
      index: 0,
      lead,
      selections: { unit: 1 },
      type: "submit-form",
    },
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
