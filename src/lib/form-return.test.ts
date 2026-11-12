import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormDefinition } from "@/lib/form-definition";

import { detectForms, runPageCommand } from "@/lib/form-filler";
import {
  FORM_RETURN_POLL_MS,
  FORM_RETURN_TIMEOUT_MS,
  rememberSubmittedForm,
  SUBMISSION_SETTLE_TIMEOUT_MS,
  SUBMISSION_UNLOAD_GRACE_MS,
  SUBMITTED_FORM_KEY,
} from "@/lib/form-return";
import { createLeadData } from "@/lib/lead-data";

const definition: FormDefinition = {
  fields: [
    {
      comparison: "exact",
      key: "name",
      kind: "text",
      selector: 'input[name="name"]',
      source: "name",
    },
  ],
  id: "section",
  marks: ["siteId"],
  matches: (form) =>
    form.querySelector('input[type="hidden"][name="siteId"]') !== null,
  name: "Formulário de seção",
  submitSelector: 'button[type="submit"]',
};
const FORM_HTML =
  '<form data-gtag-label="Seção - Enviar">' +
  '<input type="hidden" name="siteId" value="site" />' +
  '<input name="name" />' +
  '<button type="submit">Enviar</button>' +
  "</form>";
const returnCommand = {
  definitionId: "section",
  index: 1,
  type: "return-to-form",
};

function mountPage(): { form: HTMLFormElement; region: HTMLElement } {
  document.body.innerHTML =
    '<form role="search"><input name="q" /></form>' +
    '<section id="region">' +
    FORM_HTML +
    "</section>" +
    '<button type="button">Voltar para o formulário</button>';
  const region = document.getElementById("region");
  const form = region?.querySelector("form");

  if (!region || !form) {
    throw new Error("Página de teste incompleta.");
  }

  return { form, region };
}

function remountOnClick(button: HTMLButtonElement, forms = 1, delay = 0) {
  const click = vi.fn(() => {
    setTimeout(() => {
      button.parentElement?.replaceWith(
        ...Array.from({ length: forms }, () => {
          const template = document.createElement("template");
          template.innerHTML = FORM_HTML;

          return template.content;
        }),
      );
    }, delay);
  });
  button.addEventListener("click", click);

  return click;
}

async function runReturnUntil(milliseconds: number) {
  const response = runPageCommand(returnCommand, document, [definition]);
  await vi.advanceTimersByTimeAsync(milliseconds);

  return response;
}

function showSuccess(
  form: HTMLFormElement,
  buttons = ['<button type="button">Voltar para o formulário</button>'],
): HTMLButtonElement[] {
  const panel = document.createElement("div");
  panel.innerHTML = "<p>Obrigado!</p>" + buttons.join("");
  form.replaceWith(panel);

  return Array.from(panel.querySelectorAll("button"));
}

function submitted(form: HTMLFormElement, region: Element | null) {
  rememberSubmittedForm({ definitionId: "section", form, index: 1, region });
}

describe("Retorno ao formulário pela tela de sucesso", () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, SUBMITTED_FORM_KEY);
    document.body.replaceChildren();
  });

  it("depois do envio, clica em Voltar para o formulário onde ele estava e espera o mesmo formulário voltar", async () => {
    const { form } = mountPage();
    const marks = detectForms(document, [definition])[0]?.marks;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    await expect(
      runPageCommand(
        {
          definitionId: "section",
          index: 1,
          lead: createLeadData("LT-20261007-080509-001"),
          type: "submit-form",
        },
        document,
        [definition],
      ),
    ).resolves.toMatchObject({ ok: true });
    const [back] = showSuccess(form);

    if (!back) {
      throw new Error("Botão de retorno ausente.");
    }

    const outside = vi.fn();
    document.body.lastElementChild?.addEventListener("click", outside);
    const click = remountOnClick(back, 1, 300);
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "returned" });
    expect(click).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    const [returned] = detectForms(document, [definition]);
    expect(returned).toMatchObject({
      index: 1,
      label: "Seção - Enviar",
      marks,
    });
    expect(document.forms.item(1)).not.toBe(form);
  });

  it("não clica num botão de mesmo texto fora da área do formulário", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    showSuccess(form, [
      '<button type="submit">Voltar para o formulário</button>',
    ]);
    const outside = vi.fn();
    document.body.lastElementChild?.addEventListener("click", outside);
    await expect(runReturnUntil(FORM_RETURN_TIMEOUT_MS)).resolves.toEqual({
      ok: true,
      result: "missing-button",
    });
    expect(outside).not.toHaveBeenCalled();
  });

  it("reconhece o botão pelo texto normalizado", async () => {
    const { form, region } = mountPage();
    submitted(form, region);
    const [back] = showSuccess(form, [
      '<button type="button">\n  VOLTAR  para o\n formulário </button>',
    ]);

    if (!back) {
      throw new Error("Botão de retorno ausente.");
    }

    remountOnClick(back);
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "returned" });
  });

  it("não clica em nada quando há mais de um botão de retorno na área", async () => {
    const { form, region } = mountPage();
    submitted(form, region);
    const buttons = showSuccess(form, [
      '<button type="button">Voltar para o formulário</button>',
      '<button type="button">Voltar para o formulário</button>',
    ]);
    const clicks = buttons.map((button) => remountOnClick(button));
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "ambiguous-button" });
    expect(clicks.every((click) => click.mock.calls.length === 0)).toBe(true);
  });

  it("ignora o botão desabilitado", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    showSuccess(form, [
      '<button disabled type="button">Voltar para o formulário</button>',
    ]);
    await expect(runReturnUntil(FORM_RETURN_TIMEOUT_MS)).resolves.toEqual({
      ok: true,
      result: "missing-button",
    });
  });

  it("espera o site terminar o envio e mostrar a tela de sucesso antes de clicar", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    const submit = form.querySelector("button");
    submit?.setAttribute("disabled", "");
    const click = vi.fn();
    setTimeout(() => {
      const [back] = showSuccess(form);
      back?.addEventListener("click", click);

      if (back) {
        remountOnClick(back);
      }
    }, 3000);
    setTimeout(() => {
      expect(click).not.toHaveBeenCalled();
    }, 2750);
    await expect(runReturnUntil(3500)).resolves.toEqual({
      ok: true,
      result: "returned",
    });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("espera o botão aparecer depois que o formulário sai da página", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    form.remove();
    setTimeout(() => {
      const panel = document.createElement("div");
      panel.innerHTML =
        '<button type="button">Voltar para o formulário</button>';
      region.append(panel);
      const back = panel.querySelector("button");

      if (back) {
        remountOnClick(back);
      }
    }, 500);
    await expect(runReturnUntil(1000)).resolves.toEqual({
      ok: true,
      result: "returned",
    });
  });

  it("desiste sem clicar quando o site não termina o envio no prazo", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    form.querySelector("button")?.setAttribute("disabled", "");
    const outside = vi.fn();
    document.body.lastElementChild?.addEventListener("click", outside);
    await expect(runReturnUntil(SUBMISSION_SETTLE_TIMEOUT_MS)).resolves.toEqual(
      { ok: true, result: "busy" },
    );
    expect(outside).not.toHaveBeenCalled();
  });

  it("desiste quando o formulário não volta no prazo", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    showSuccess(form);
    let settled = false;
    const response = runPageCommand(returnCommand, document, [
      definition,
    ]).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(FORM_RETURN_TIMEOUT_MS - 250);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(250);
    await expect(response).resolves.toEqual({ ok: true, result: "timeout" });
  });

  it("não aceita quando mais de um formulário aparece na área", async () => {
    const { form, region } = mountPage();
    submitted(form, region);
    const [back] = showSuccess(form);

    if (!back) {
      throw new Error("Botão de retorno ausente.");
    }

    remountOnClick(back, 2);
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "ambiguous-form" });
  });

  it("não clica quando o formulário enviado continua na página", async () => {
    const { form, region } = mountPage();
    submitted(form, region);
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "form-present" });
  });

  it("espera um instante depois que o site termina o envio, para a página poder sair antes de o formulário ser conferido", async () => {
    vi.useFakeTimers();
    const { form, region } = mountPage();
    submitted(form, region);
    const submit = form.querySelector("button");
    submit?.setAttribute("disabled", "");
    setTimeout(() => {
      submit?.removeAttribute("disabled");
    }, 500);
    const response = runPageCommand(returnCommand, document, [definition]);
    await vi.advanceTimersByTimeAsync(
      500 + SUBMISSION_UNLOAD_GRACE_MS - FORM_RETURN_POLL_MS,
    );
    await expect(
      Promise.race([response, Promise.resolve("esperando")]),
    ).resolves.toBe("esperando");
    await vi.advanceTimersByTimeAsync(FORM_RETURN_POLL_MS);
    await expect(response).resolves.toEqual({
      ok: true,
      result: "form-present",
    });
  });

  it("não clica quando a área do formulário saiu da página ou é a página inteira", async () => {
    const { form, region } = mountPage();
    submitted(form, region);
    showSuccess(form);
    region.remove();
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "missing-region" });

    document.body.innerHTML =
      '<form role="search"></form>' +
      FORM_HTML +
      '<button type="button">Voltar para o formulário</button>';
    const bodyForm = document.forms.item(1);

    if (!bodyForm) {
      throw new Error("Formulário de teste ausente.");
    }

    submitted(bodyForm, bodyForm.parentElement);
    bodyForm.remove();
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "missing-region" });
  });

  it("não clica sem um envio anterior do mesmo formulário neste documento", async () => {
    const { form, region } = mountPage();
    showSuccess(form);
    await expect(
      runPageCommand(returnCommand, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "unknown-form" });
    submitted(form, region);
    await expect(
      runPageCommand({ ...returnCommand, index: 2 }, document, [definition]),
    ).resolves.toEqual({ ok: true, result: "unknown-form" });
    await expect(
      runPageCommand({ ...returnCommand, definitionId: "other" }, document, [
        definition,
      ]),
    ).resolves.toEqual({ ok: true, result: "unknown-form" });
  });

  it.each([
    { index: 1, type: "return-to-form" },
    { definitionId: "section", index: "1", type: "return-to-form" },
  ])("rejeita o comando de retorno inválido %j", async (command) => {
    await expect(
      runPageCommand(command, document, [definition]),
    ).resolves.toEqual({ error: "Comando não suportado.", ok: false });
  });
});
