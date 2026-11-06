import { PANEL_ACCOUNT_ID, panelReport } from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it } from "vitest";

import type { VerifiedLead } from "@/lib/integration-status";

import {
  buildFocusHash,
  createLeadFocusCommand,
  describeLeadFocus,
  findLeadDetail,
  findLeadRow,
  isLeadFocusResult,
  LEAD_FOCUS_HIGHLIGHT_MS,
  type LeadFocusCommand,
  type LeadFocusEnvironment,
  parseLeadFocusCommand,
  runLeadFocus,
} from "@/lib/lead-focus";

const LEAD = panelReport.leads[0] as VerifiedLead;
const COMMAND = createLeadFocusCommand(LEAD, PANEL_ACCOUNT_ID);
const LIST_HASH = "#/contas/" + PANEL_ACCOUNT_ID + "/leads?status=NEW&page=3";
const OTHER_ID = "00000000-0000-4000-8000-000000000099";

function createEnvironment(
  steps: Record<number, () => void> = {},
  hash = LIST_HASH,
) {
  let time = 0;
  const scheduled: { at: number; callback: () => void }[] = [];
  const location = { hash, origin: "https://admin.autodromo.com.br" };

  function advance(milliseconds: number) {
    const until = time + milliseconds;

    while (time < until) {
      time += 250;
      steps[time]?.();

      for (const task of scheduled.filter(({ at }) => at <= time)) {
        scheduled.splice(scheduled.indexOf(task), 1);
        task.callback();
      }
    }
  }

  const environment: LeadFocusEnvironment = {
    document,
    location,
    now: () => time,
    reduceMotion: false,
    schedule: (callback, milliseconds) => {
      scheduled.push({ at: time + milliseconds, callback });
    },
    wait: async (milliseconds) => {
      advance(milliseconds);
    },
  };
  steps[0]?.();

  return { advance, environment, location, now: () => time };
}

function formatPanelDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function renderDetail(email = LEAD.email) {
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div role="presentation"><div><h2>Detalhes da conversão</h2><p>' +
      email +
      "</p></div></div>",
  );
}

function renderRows(rows: string[][]) {
  document.querySelector("table")?.remove();
  document.body.insertAdjacentHTML(
    "afterbegin",
    "<table><tbody>" +
      rows
        .map(
          (cells) =>
            "<tr>" +
            cells.map((cell) => "<td>" + cell + "</td>").join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table>",
  );
}

function rowOf(text: string): HTMLElement | undefined {
  return [...document.querySelectorAll("tr")].find((row) =>
    row.textContent?.includes(text),
  );
}

describe("Foco no lead do painel", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Element.prototype.scrollIntoView = () => {};
  });

  it("monta o pedido pelo identificador do lead, com a busca pelo identificador de teste", () => {
    expect(COMMAND).toEqual({
      accountId: PANEL_ACCOUNT_ID,
      createdAt: LEAD.createdAt,
      email: LEAD.email,
      leadId: LEAD.id,
      phone: LEAD.phone,
      search: "LT-20261008-141748-012",
      submissionId: "LT-20261008-141748-012",
    });
    const lead = panelReport.leads[1] as VerifiedLead;
    expect(createLeadFocusCommand(lead, PANEL_ACCOUNT_ID).search).toBe(
      lead.email,
    );
    expect(
      createLeadFocusCommand({ ...lead, email: "" }, PANEL_ACCOUNT_ID).search,
    ).toBe(lead.phone);
    expect(
      createLeadFocusCommand(
        { ...lead, email: "", phone: "" },
        PANEL_ACCOUNT_ID,
      ).search,
    ).toBe("");
  });

  it("troca só o hash para a lista da mesma conta, na primeira página, com o lead e a busca", () => {
    expect(buildFocusHash(LIST_HASH, COMMAND)).toBe(
      "#/contas/" +
        PANEL_ACCOUNT_ID +
        "/leads?status=NEW&page=1&leadId=" +
        LEAD.id +
        "&search=LT-20261008-141748-012",
    );
    expect(
      buildFocusHash(
        "#/contas/" + PANEL_ACCOUNT_ID + "/leads?search=antigo&leadId=x",
        { ...COMMAND, search: "" },
      ),
    ).toBe(
      "#/contas/" + PANEL_ACCOUNT_ID + "/leads?leadId=" + LEAD.id + "&page=1",
    );
    expect(
      buildFocusHash("#/contas/" + OTHER_ID + "/leads?status=NEW", COMMAND),
    ).toBe(
      "#/contas/" +
        PANEL_ACCOUNT_ID +
        "/leads?page=1&leadId=" +
        LEAD.id +
        "&search=LT-20261008-141748-012",
    );
    expect(
      buildFocusHash("#/contas/" + PANEL_ACCOUNT_ID + "/relatorios", {
        ...COMMAND,
        search: "bruna.exemplo@example.com",
      }),
    ).toBe(
      "#/contas/" +
        PANEL_ACCOUNT_ID +
        "/leads?page=1&leadId=" +
        LEAD.id +
        "&search=bruna.exemplo%40example.com",
    );
  });

  it.each<[string, Partial<LeadFocusCommand>]>([
    ["conta inválida", { accountId: "conta" }],
    ["lead sem identificador no formato", { leadId: "1 OR 1=1" }],
    ["data inválida", { createdAt: "ontem" }],
    ["busca com caractere de controle", { search: "LT\n" }],
    ["busca longa", { search: "a".repeat(101) }],
    ["identificador de teste inválido", { submissionId: "LT-1" }],
  ])("recusa o pedido com %s", (_case, change) => {
    expect(parseLeadFocusCommand({ ...COMMAND, ...change })).toBeUndefined();
  });

  it("aceita só o resultado esperado da página", () => {
    expect(isLeadFocusResult({ detail: "confirmed", row: "highlighted" })).toBe(
      true,
    );
    expect(isLeadFocusResult({ detail: "sim", row: "highlighted" })).toBe(
      false,
    );
    expect(isLeadFocusResult({ detail: "confirmed" })).toBe(false);
  });

  it("confirma o detalhe pelo e-mail do lead e ignora detalhe oculto ou de outro lead", () => {
    renderDetail("outra.pessoa@example.com");
    expect(findLeadDetail(document, COMMAND).confirmed).toBe(false);
    document.body.replaceChildren();
    document.body.insertAdjacentHTML(
      "beforeend",
      "<aside hidden><h2>Detalhes da conversão</h2><p>" +
        LEAD.email +
        "</p></aside>",
    );
    expect(findLeadDetail(document, COMMAND).confirmed).toBe(false);
    document.body.replaceChildren();
    renderRows([["Detalhes da conversão", LEAD.email]]);
    expect(findLeadDetail(document, COMMAND).confirmed).toBe(false);
    document.body.replaceChildren();
    document.body.insertAdjacentHTML(
      "beforeend",
      "<section><div><h3>Detalhes da conversão</h3></div><dl><dd>" +
        LEAD.email.toUpperCase() +
        "</dd></dl></section>",
    );
    expect(findLeadDetail(document, COMMAND)).toMatchObject({
      confirmed: true,
      container: document.querySelector("section"),
    });
  });

  it("identifica a linha pelo identificador do lead ou pelo e-mail com a data da conversão, nunca só pelo nome", () => {
    const date = formatPanelDate(LEAD.createdAt);
    renderRows([[LEAD.name, "outra.pessoa@example.com", date]]);
    expect(findLeadRow(document, COMMAND, undefined)).toEqual({
      status: "missing",
    });
    renderRows([
      [LEAD.name, LEAD.email, date],
      [LEAD.name, LEAD.email, formatPanelDate("2026-10-01T12:00:00.000Z")],
    ]);
    expect(findLeadRow(document, COMMAND, undefined)).toEqual({
      element: rowOf(date),
      status: "found",
    });
    renderRows([
      [LEAD.name, LEAD.email, date],
      [LEAD.name, LEAD.email, date],
    ]);
    expect(findLeadRow(document, COMMAND, undefined)).toEqual({
      status: "ambiguous",
    });
    renderRows([
      [
        LEAD.name,
        LEAD.email,
        date,
        '<a href="#/leads?leadId=' + LEAD.id + '">Ver</a>',
      ],
      [
        LEAD.name,
        LEAD.email,
        date,
        '<a href="#/leads?leadId=' + OTHER_ID + '">Ver</a>',
      ],
    ]);
    expect(findLeadRow(document, COMMAND, undefined)).toEqual({
      element: document.querySelector("tr"),
      status: "found",
    });
    renderRows([[LEAD.name, LEAD.email, "ontem"]]);
    expect(findLeadRow(document, COMMAND, undefined)).toEqual({
      status: "ambiguous",
    });
  });

  it("não procura a linha dentro do detalhe nem em lista oculta", () => {
    const date = formatPanelDate(LEAD.createdAt);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div role="dialog"><h2>Detalhes da conversão</h2><ul><li>' +
        LEAD.email +
        " " +
        date +
        "</li></ul></div><ul hidden><li>" +
        LEAD.email +
        " " +
        date +
        "</li></ul>",
    );
    const detail = findLeadDetail(document, COMMAND);
    expect(detail.confirmed).toBe(true);
    expect(findLeadRow(document, COMMAND, detail.container)).toEqual({
      status: "missing",
    });
  });

  it("vai para o lead, confirma o detalhe, destaca a linha por 3 s e restaura o estilo", async () => {
    const date = formatPanelDate(LEAD.createdAt);
    const { advance, environment, location } = createEnvironment({
      500: () => renderRows([[LEAD.name, LEAD.email, date]]),
      750: () => renderDetail(),
    });
    await expect(runLeadFocus(COMMAND, environment)).resolves.toEqual({
      ok: true,
      result: { detail: "confirmed", row: "highlighted" },
    });
    expect(location.hash).toBe(buildFocusHash(LIST_HASH, COMMAND));
    const row = rowOf(date);
    expect(row?.style.getPropertyValue("outline")).toBe("4px solid Highlight");
    expect(row?.style.getPropertyPriority("outline")).toBe("important");
    advance(LEAD_FOCUS_HIGHLIGHT_MS);
    expect(row?.style.getPropertyValue("outline")).toBe("");
    expect(row?.getAttribute("style") ?? "").toBe("");
  });

  it("mantém o destaque quando a lista é desenhada de novo, sem passar de 3 s", async () => {
    const date = formatPanelDate(LEAD.createdAt);
    const { advance, environment } = createEnvironment({
      0: () => renderRows([[LEAD.name, LEAD.email, date]]),
      500: () => renderDetail(),
    });
    await runLeadFocus(COMMAND, environment);
    renderRows([[LEAD.name, LEAD.email, date]]);
    advance(250);
    expect(rowOf(date)?.style.getPropertyValue("outline")).toBe(
      "4px solid Highlight",
    );
    advance(LEAD_FOCUS_HIGHLIGHT_MS);
    expect(rowOf(date)?.style.getPropertyValue("outline")).toBe("");
  });

  it("restaura o estilo original quando o lead é acionado de novo durante o destaque", async () => {
    const date = formatPanelDate(LEAD.createdAt);
    const { advance, environment } = createEnvironment({
      0: () => renderRows([[LEAD.name, LEAD.email, date]]),
      500: () => renderDetail(),
    });
    await runLeadFocus(COMMAND, environment);
    advance(1000);
    await runLeadFocus(COMMAND, environment);
    advance(LEAD_FOCUS_HIGHLIGHT_MS - 1000);
    expect(rowOf(date)?.style.getPropertyValue("outline")).toBe(
      "4px solid Highlight",
    );
    advance(LEAD_FOCUS_HIGHLIGHT_MS);
    expect(rowOf(date)?.getAttribute("style") ?? "").toBe("");
  });

  it("abre só o detalhe e diz isso quando a linha é ambígua ou não aparece", async () => {
    const date = formatPanelDate(LEAD.createdAt);
    const ambiguous = createEnvironment({
      250: () =>
        renderRows([
          [LEAD.name, LEAD.email, date],
          [LEAD.name, LEAD.email, date],
        ]),
      500: () => renderDetail(),
    });
    await expect(runLeadFocus(COMMAND, ambiguous.environment)).resolves.toEqual(
      { ok: true, result: { detail: "confirmed", row: "ambiguous" } },
    );
    expect(ambiguous.now()).toBe(2500);
    expect(document.querySelector("[style]")).toBeNull();
    document.body.replaceChildren();
    const missing = createEnvironment({ 500: () => renderDetail() });
    await expect(runLeadFocus(COMMAND, missing.environment)).resolves.toEqual({
      ok: true,
      result: { detail: "confirmed", row: "missing" },
    });
  });

  it("desiste no prazo, sem sucesso falso", async () => {
    const { environment, now } = createEnvironment();
    await expect(runLeadFocus(COMMAND, environment)).resolves.toEqual({
      ok: true,
      result: { detail: "unconfirmed", row: "missing" },
    });
    expect(now()).toBe(10000);
  });

  it("não age fora do painel nem com pedido inválido", async () => {
    const outside = createEnvironment();
    outside.environment.location.origin = "https://example.com";
    await expect(runLeadFocus(COMMAND, outside.environment)).resolves.toEqual({
      error:
        "Abra o painel administrativo na aba ativa para verificar as integrações.",
      ok: false,
    });
    const invalid = createEnvironment();
    await expect(
      runLeadFocus({ ...COMMAND, leadId: "x" }, invalid.environment),
    ).resolves.toMatchObject({ ok: false });
    expect(outside.location.hash).toBe(LIST_HASH);
    expect(invalid.location.hash).toBe(LIST_HASH);
  });

  it("descreve cada resultado sem afirmar o que não aconteceu", () => {
    expect(describeLeadFocus({ detail: "confirmed", row: "highlighted" })).toBe(
      "Lead localizado: detalhe aberto e linha destacada no painel.",
    );
    expect(describeLeadFocus({ detail: "confirmed", row: "ambiguous" })).toBe(
      "Detalhe do lead aberto no painel. A linha não foi destacada porque não foi possível identificá-la sem ambiguidade.",
    );
    expect(describeLeadFocus({ detail: "confirmed", row: "missing" })).toBe(
      "Detalhe do lead aberto no painel, mas não foi possível localizar o lead na listagem.",
    );
    expect(describeLeadFocus({ detail: "unconfirmed", row: "missing" })).toBe(
      "Não foi possível localizar o lead na listagem.",
    );
    expect(
      describeLeadFocus({ detail: "unconfirmed", row: "highlighted" }),
    ).toBe(
      "Linha do lead destacada no painel, mas não foi possível confirmar o detalhe aberto.",
    );
  });
});
