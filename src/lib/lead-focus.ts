import type { VerifiedLead } from "@/lib/integration-status";
import type { PageResponse } from "@/lib/page-command";

import { isRecord } from "@/lib/is-record";
import { findSubmissionId, isSubmissionId } from "@/lib/lead-data";
import { SEARCH_MAX_LENGTH } from "@/lib/panel-query";
import {
  isPanelId,
  PANEL_ORIGIN,
  PANEL_REQUIRED_MESSAGE,
} from "@/lib/panel-session";

export type LeadFocusCommand = {
  accountId: string;
  createdAt: string;
  email: string;
  leadId: string;
  phone: string;
  search: string;
  submissionId: string;
};

export type LeadFocusEnvironment = {
  document: Document;
  location: { hash: string; origin: string };
  now: () => number;
  reduceMotion: boolean;
  schedule: (callback: () => void, milliseconds: number) => void;
  wait: (milliseconds: number) => Promise<void>;
};

export type LeadFocusResult = {
  detail: "confirmed" | "unconfirmed";
  row: "ambiguous" | "highlighted" | "missing";
};

export type LeadRowMatch =
  | { element: HTMLElement; status: "found" }
  | { status: "ambiguous" | "missing" };

type LeadKeys = { email: string; phone: string; submissionId: string };

export const LEAD_FOCUS_HIGHLIGHT_MS = 3000;
export const LEAD_FOCUS_KEY = "leadIntegrationTesterLeadFocus";
export const LEAD_FOCUS_POLL_MS = 250;
export const LEAD_FOCUS_SETTLE_MS = 2000;
export const LEAD_FOCUS_TIMEOUT_MS = 10000;

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const DETAIL_BOUNDARY_SELECTOR =
  '[aria-modal="true"], [role="dialog"], [role="presentation"], aside, dialog';
const DETAIL_TITLE = "detalhes da conversão";
const HIDDEN_SELECTOR = "[hidden]";
const HIGHLIGHT_OFFSET = "-4px";
const HIGHLIGHT_OUTLINE = "4px solid Highlight";
const HIGHLIGHTED_ROWS = new WeakMap<
  HTMLElement,
  {
    owner: symbol;
    previous: { priority: string; property: string; value: string }[];
  }
>();
const LEADS_ROUTE_PATTERN = /^#\/contas\/([^/?#]+)\/leads\/?(?:\?(.*))?$/;
const LIST_SELECTOR = '[role="grid"], [role="table"], table';
const MIN_PHONE_DIGITS = 8;
const ROW_SELECTOR = '[role="row"], li, tr';
const TEXT_MAX_LENGTH = 254;

export function buildFocusHash(
  hash: string,
  { accountId, leadId, search }: LeadFocusCommand,
): string {
  const route = LEADS_ROUTE_PATTERN.exec(hash);
  const parameters = new URLSearchParams(
    route && route[1]?.toLowerCase() === accountId.toLowerCase()
      ? (route[2] ?? "")
      : "",
  );
  parameters.set("page", "1");
  parameters.set("leadId", leadId);

  if (search) {
    parameters.set("search", search);
  } else {
    parameters.delete("search");
  }

  return "#/contas/" + accountId + "/leads?" + parameters.toString();
}

export function createLeadFocusCommand(
  lead: VerifiedLead,
  accountId: string,
): LeadFocusCommand {
  const submissionId =
    findSubmissionId(lead.name) ?? findSubmissionId(lead.email) ?? "";

  return {
    accountId,
    createdAt: lead.createdAt,
    email: lead.email,
    leadId: lead.id,
    phone: lead.phone,
    search: [submissionId, lead.email, lead.phone].find(isSearchText) ?? "",
    submissionId,
  };
}

export function describeLeadFocus({ detail, row }: LeadFocusResult): string {
  if (row === "highlighted") {
    return detail === "confirmed"
      ? "Lead localizado: detalhe aberto e linha destacada no painel."
      : "Linha do lead destacada no painel, mas não foi possível confirmar o detalhe aberto.";
  }

  if (detail === "confirmed") {
    return row === "ambiguous"
      ? "Detalhe do lead aberto no painel. A linha não foi destacada porque não foi possível identificá-la sem ambiguidade."
      : "Detalhe do lead aberto no painel, mas não foi possível localizar o lead na listagem.";
  }

  return row === "ambiguous"
    ? "Não foi possível localizar o lead na listagem: a linha não pôde ser identificada sem ambiguidade."
    : "Não foi possível localizar o lead na listagem.";
}

export function findLeadDetail(
  document: Document,
  command: LeadFocusCommand,
): { confirmed: boolean; container: Element | undefined } {
  const keys = readKeys(command);
  let unconfirmed: Element | undefined;

  for (const title of findDetailTitles(document)) {
    if (title.closest(LIST_SELECTOR) || title.closest(HIDDEN_SELECTOR)) {
      continue;
    }

    const boundary = title.closest(DETAIL_BOUNDARY_SELECTOR);
    const container = boundary ?? findKeyAncestor(title, keys);

    if (container && hasKey(container, keys)) {
      return { confirmed: true, container };
    }

    unconfirmed ??= boundary ?? undefined;
  }

  return { confirmed: false, container: unconfirmed };
}

export function findLeadRow(
  document: Document,
  command: LeadFocusCommand,
  detail: Element | undefined,
): LeadRowMatch {
  const keys = readKeys(command);
  const rows = [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter(
    (row) =>
      !row.closest(HIDDEN_SELECTOR) &&
      (!detail || (!detail.contains(row) && !row.contains(detail))),
  );
  const byId = keepInnermost(
    rows.filter((row) => row.outerHTML.includes(command.leadId)),
  );

  if (byId.length === 1 && byId[0]) {
    return { element: byId[0], status: "found" };
  }

  const byKey = keepInnermost(rows.filter((row) => hasKey(row, keys)));
  const byDate = byKey.filter((row) => hasDate(row, command.createdAt));

  if (byDate.length === 1 && byDate[0]) {
    return { element: byDate[0], status: "found" };
  }

  return { status: byKey.length > 0 ? "ambiguous" : "missing" };
}

export function isLeadFocusResult(value: unknown): value is LeadFocusResult {
  return (
    isRecord(value) &&
    (value.detail === "confirmed" || value.detail === "unconfirmed") &&
    (value.row === "ambiguous" ||
      value.row === "highlighted" ||
      value.row === "missing")
  );
}

export function parseLeadFocusCommand(
  value: unknown,
): LeadFocusCommand | undefined {
  if (
    !isRecord(value) ||
    !isPanelId(value.accountId) ||
    !isPanelId(value.leadId) ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !isText(value.email) ||
    !isText(value.phone) ||
    !(value.search === "" || isSearchText(value.search)) ||
    !(value.submissionId === "" || isSubmissionId(value.submissionId))
  ) {
    return undefined;
  }

  return {
    accountId: value.accountId,
    createdAt: value.createdAt,
    email: value.email,
    leadId: value.leadId,
    phone: value.phone,
    search: value.search,
    submissionId: value.submissionId,
  };
}

export async function runLeadFocus(
  value: unknown,
  environment: LeadFocusEnvironment,
): Promise<PageResponse<LeadFocusResult>> {
  if (environment.location.origin !== PANEL_ORIGIN) {
    return { error: PANEL_REQUIRED_MESSAGE, ok: false };
  }

  const command = parseLeadFocusCommand(value);

  if (!command) {
    return {
      error:
        "O pedido para localizar o lead chegou inválido. Verifique as integrações de novo e tente outra vez.",
      ok: false,
    };
  }

  const hash = buildFocusHash(environment.location.hash, command);

  if (environment.location.hash !== hash) {
    environment.location.hash = hash;
  }

  const startedAt = environment.now();
  let confirmedAt: number | undefined;
  let highlighted = false;
  let previous: HTMLElement | undefined;
  let row: LeadRowMatch["status"] = "missing";

  for (;;) {
    const now = environment.now();
    const detail = findLeadDetail(environment.document, command);

    if (detail.confirmed) {
      confirmedAt ??= now;
    }

    if (!highlighted) {
      const match = findLeadRow(
        environment.document,
        command,
        detail.container,
      );

      if (match.status === "found" && match.element === previous) {
        keepHighlighted(match.element, command, environment);
        highlighted = true;
      }

      previous = match.status === "found" ? match.element : undefined;
      row = match.status;
    }

    if (
      (confirmedAt !== undefined &&
        (highlighted || now - confirmedAt >= LEAD_FOCUS_SETTLE_MS)) ||
      now - startedAt >= LEAD_FOCUS_TIMEOUT_MS
    ) {
      return {
        ok: true,
        result: {
          detail: confirmedAt === undefined ? "unconfirmed" : "confirmed",
          row: highlighted
            ? "highlighted"
            : row === "ambiguous"
              ? "ambiguous"
              : "missing",
        },
      };
    }

    await environment.wait(LEAD_FOCUS_POLL_MS);
  }
}

function findDetailTitles(document: Document): Element[] {
  const titles: Element[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      node.parentElement &&
      normalizeText(node.textContent ?? "").includes(DETAIL_TITLE)
    ) {
      titles.push(node.parentElement);
    }
  }

  return titles;
}

function findKeyAncestor(title: Element, keys: LeadKeys): Element | undefined {
  for (
    let element = title.parentElement;
    element && element !== element.ownerDocument.body;
    element = element.parentElement
  ) {
    if (
      element.matches(ROW_SELECTOR) ||
      element.matches(LIST_SELECTOR) ||
      element.querySelector(LIST_SELECTOR)
    ) {
      return undefined;
    }

    if (hasKey(element, keys)) {
      return element;
    }
  }

  return undefined;
}

function hasDate(element: Element, createdAt: string): boolean {
  const date = new Date(createdAt);
  const text = normalizeText(element.textContent ?? "");

  return (
    text.includes(
      pad(date.getDate()) +
        "/" +
        pad(date.getMonth() + 1) +
        "/" +
        date.getFullYear(),
    ) && text.includes(pad(date.getHours()) + ":" + pad(date.getMinutes()))
  );
}

function hasKey(
  element: Element,
  { email, phone, submissionId }: LeadKeys,
): boolean {
  const text = normalizeText(element.textContent ?? "");

  return (
    (email !== "" && text.includes(email)) ||
    (submissionId !== "" && text.includes(submissionId)) ||
    (phone !== "" && text.replace(/\D/g, "").includes(phone))
  );
}

function highlightRow(element: HTMLElement, reduceMotion: boolean): () => void {
  const { style } = element;
  const owner = Symbol();
  const previous =
    HIGHLIGHTED_ROWS.get(element)?.previous ??
    ["outline", "outline-offset"].map((property) => ({
      priority: style.getPropertyPriority(property),
      property,
      value: style.getPropertyValue(property),
    }));
  HIGHLIGHTED_ROWS.set(element, { owner, previous });
  element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
  });
  style.setProperty("outline", HIGHLIGHT_OUTLINE, "important");
  style.setProperty("outline-offset", HIGHLIGHT_OFFSET, "important");

  return () => {
    if (HIGHLIGHTED_ROWS.get(element)?.owner !== owner) {
      return;
    }

    HIGHLIGHTED_ROWS.delete(element);

    for (const { priority, property, value } of previous) {
      if (value) {
        style.setProperty(property, value, priority);
      } else {
        style.removeProperty(property);
      }
    }
  };
}

function isSearchText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value.length <= SEARCH_MAX_LENGTH &&
    value.trim() === value &&
    !CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= TEXT_MAX_LENGTH &&
    !CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function keepHighlighted(
  element: HTMLElement,
  command: LeadFocusCommand,
  environment: LeadFocusEnvironment,
): void {
  const until = environment.now() + LEAD_FOCUS_HIGHLIGHT_MS;
  let current = element;
  let restore = highlightRow(current, environment.reduceMotion);

  function check() {
    if (environment.now() >= until) {
      restore();

      return;
    }

    if (!current.isConnected) {
      restore();
      restore = () => undefined;
      const match = findLeadRow(
        environment.document,
        command,
        findLeadDetail(environment.document, command).container,
      );

      if (match.status === "found") {
        current = match.element;
        restore = highlightRow(current, environment.reduceMotion);
      }
    }

    environment.schedule(check, LEAD_FOCUS_POLL_MS);
  }

  environment.schedule(check, LEAD_FOCUS_POLL_MS);
}

function keepInnermost<Item extends Element>(elements: Item[]): Item[] {
  return elements.filter(
    (element) =>
      !elements.some((other) => other !== element && element.contains(other)),
  );
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function readKeys({ email, phone, submissionId }: LeadFocusCommand): LeadKeys {
  const address = normalizeText(email.trim());
  const digits = phone.replace(/\D/g, "");
  const number = !address && digits.length >= MIN_PHONE_DIGITS ? digits : "";

  return {
    email: address,
    phone: number,
    submissionId: address || number ? "" : submissionId.toLowerCase(),
  };
}
