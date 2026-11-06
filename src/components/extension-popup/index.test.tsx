import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { panelReport } from "@tests/fixtures/panel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { ExtensionPopup } from "@/components/extension-popup";
import { addSubmission } from "@/lib/submission-history";

const runtime: { sendMessage: (message: unknown) => Promise<unknown> } =
  browser.runtime;
const tabs: { query: (query: object) => Promise<object[]> } = browser.tabs;
const windows: { getCurrent: () => Promise<object> } = browser.windows;

describe("Popup da extensão", () => {
  it("mostra a base e confirma a conexão com o background", async () => {
    vi.spyOn(runtime, "sendMessage").mockResolvedValue({
      message: "Extensão conectada ao background.",
      ok: true,
    });
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    expect(
      screen.getByRole("heading", { name: "Scanner de Leads" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Extensão conectada ao background.",
    );
  });

  it("permite tentar novamente quando o background falha", async () => {
    const sendMessage = vi
      .spyOn(runtime, "sendMessage")
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({
        message: "Extensão conectada ao background.",
        ok: true,
      });
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível verificar a extensão. Tente novamente.",
    );
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Extensão conectada ao background.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("impede envio duplicado enquanto verifica e mantém o foco", async () => {
    let finish: (response: unknown) => void = () => {};
    vi.spyOn(runtime, "sendMessage").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    await user.click(
      screen.getByRole("button", { name: "Verificar extensão" }),
    );
    const button = screen.getByRole("button", {
      name: "Verificando extensão…",
    });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    finish({ message: "Extensão conectada ao background.", ok: true });
    expect(
      await screen.findByRole("button", { name: "Verificar extensão" }),
    ).toHaveFocus();
  });

  it("mostra o histórico gravado e acrescenta cada envio novo", async () => {
    fakeBrowser.reset();
    await addSubmission({
      definitionId: "autodromo-offer",
      definitionName: "Formulário de oferta",
      formLabel: "oferta - GEELY EX5 PRO - Enviar",
      id: "LT-20261006-101500-001",
      pageUrl: "https://example.com/",
      submittedAt: new Date().toISOString(),
      values: { name: "Teste LT-20261006-101500-001" },
    });
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: "https://example.com/" },
    ]);
    let command: unknown;
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async (injection) => {
        if ("args" in injection) {
          command = injection.args?.[1];
        }

        return [
          {
            documentId: "document",
            frameId: 0,
            result:
              typeof command === "object" &&
              command !== null &&
              "lead" in command
                ? {
                    ok: true,
                    result: { unfilledFields: [], values: command.lead },
                  }
                : {
                    ok: true,
                    result: [
                      {
                        definitionId: "autodromo-section",
                        definitionName: "Formulário de seção",
                        index: 1,
                        label: "Título da seção - Enviar",
                        selects: [],
                      },
                    ],
                  },
          },
        ];
      },
    );
    const user = userEvent.setup();
    render(<ExtensionPopup />);
    const history = screen.getByRole("region", { name: "Histórico de envios" });
    expect(await within(history).findAllByRole("listitem")).toHaveLength(1);
    await user.click(
      await screen.findByRole("button", { name: "Enviar teste" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar envio" }));
    const message = await screen.findByText(
      /^Envio LT-\d{8}-\d{6}-001 disparado\./,
    );
    const id = /LT-\d{8}-\d{6}-001/.exec(message.textContent)?.[0] ?? "";
    await waitFor(() =>
      expect(within(history).getAllByRole("listitem")).toHaveLength(2),
    );
    const items = within(history).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(id);
    expect(items[0]).toHaveTextContent(
      "Formulário de seção · Título da seção - Enviar",
    );
    expect(items[0]).toHaveTextContent("Teste " + id);
    expect(items[0]).toHaveTextContent(id.toLowerCase() + "@example.com");
    expect(items[1]).toHaveTextContent("LT-20261006-101500-001");
  });

  it("no painel, troca os formulários pela verificação das integrações", async () => {
    fakeBrowser.reset();
    await addSubmission({
      definitionId: "autodromo-offer",
      definitionName: "Formulário de oferta",
      formLabel: "oferta - GEELY EX5 PRO - Enviar",
      id: "LT-20261006-101500-001",
      pageUrl: "https://example.com/",
      submittedAt: new Date().toISOString(),
      values: { name: "Teste LT-20261006-101500-001" },
    });
    vi.spyOn(tabs, "query").mockResolvedValue([
      {
        id: 7,
        url: "https://admin.autodromo.com.br/#/contas/11111111-1111-4111-8111-111111111111/leads?page=1",
      },
    ]);
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    render(<ExtensionPopup />);
    expect(
      await screen.findByRole("region", { name: "Integrações dos leads" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verificar integrações" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("region", { name: "Formulários da página" }),
    ).not.toBeInTheDocument();
    expect(
      await within(
        screen.getByRole("region", { name: "Histórico de envios" }),
      ).findAllByRole("listitem"),
    ).toHaveLength(1);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("fora do painel, não oferece a verificação das integrações", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([
      { id: 7, url: "https://admin.autodromo.com.br.example.com/contas" },
    ]);
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async () => [
        {
          documentId: "document",
          frameId: 0,
          result: { ok: true, result: [] },
        },
      ],
    );
    render(<ExtensionPopup />);
    expect(
      await screen.findByRole("region", { name: "Formulários da página" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Integrações dos leads" }),
    ).not.toBeInTheDocument();
  });
});

const PANEL_TAB = {
  id: 8,
  url: "https://admin.autodromo.com.br/#/contas/11111111-1111-4111-8111-111111111111/leads?page=1",
};
const SITE_FORMS = [
  {
    definitionId: "autodromo-section",
    definitionName: "Formulário de seção",
    index: 1,
    label: "Título da seção - Enviar",
    selects: [],
  },
];
const SITE_TAB = { id: 7, url: "https://loja.example.com/ofertas" };

type Injection = { args?: unknown[]; files?: string[]; func?: unknown };

const commands = new Map<number, unknown>();

function countDetections(executeScript: { mock: { calls: unknown[][] } }) {
  return executeScript.mock.calls.filter(([injection]) => {
    const { args } = injection as Injection;

    return (
      typeof args?.[1] === "object" &&
      args[1] !== null &&
      "type" in args[1] &&
      args[1].type === "detect-forms"
    );
  }).length;
}

function mockPermissions(granted: Set<string>) {
  const listeners: (() => void)[] = [];
  const permissions: {
    contains: (permissions: { origins?: string[] }) => Promise<boolean>;
    request: (permissions: { origins?: string[] }) => Promise<boolean>;
  } = browser.permissions;
  vi.spyOn(permissions, "contains").mockImplementation(
    async ({ origins = [] }) => origins.every((origin) => granted.has(origin)),
  );
  vi.spyOn(browser.permissions.onAdded, "addListener").mockImplementation(
    (listener) => {
      listeners.push(() => listener({}));
    },
  );
  vi.spyOn(browser.permissions.onAdded, "removeListener").mockImplementation(
    () => undefined,
  );
  vi.spyOn(browser.permissions.onRemoved, "addListener").mockImplementation(
    () => undefined,
  );
  vi.spyOn(browser.permissions.onRemoved, "removeListener").mockImplementation(
    () => undefined,
  );

  return {
    notify: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    request: vi.spyOn(permissions, "request"),
  };
}

function mockScripts(granted: Set<string>) {
  return vi
    .spyOn(browser.scripting, "executeScript")
    .mockImplementation(async (injection) => {
      const { args, files, func } = injection as Injection;
      const tabId = (injection.target as { tabId: number }).tabId;
      const origin = tabId === PANEL_TAB.id ? PANEL_TAB.url : SITE_TAB.url;

      if (func && !args && !granted.has(new URL(origin).origin + "/*")) {
        throw new Error("Cannot access contents of the page.");
      }

      const command = commands.get(tabId);

      if (args) {
        commands.set(tabId, args[1]);
      }

      return [
        {
          documentId: "document",
          frameId: 0,
          result: !files
            ? undefined
            : files[0] === "/lead-integrations.js"
              ? {
                  ok: true,
                  result: {
                    leads: [
                      {
                        ...panelReport.leads[1],
                        email: "",
                        name:
                          "Teste " +
                          String(
                            (command as { search?: string } | undefined)
                              ?.search || "Bruna",
                          ),
                      },
                    ],
                    missingLeads: 0,
                  },
                }
              : typeof command === "object" &&
                  command !== null &&
                  "lead" in command
                ? {
                    ok: true,
                    result: { unfilledFields: [], values: command.lead },
                  }
                : { ok: true, result: SITE_FORMS },
        },
      ];
    });
}

function mockTabs(tabs: { active: object; panel?: object }) {
  const query: { query: (query: object) => Promise<object[]> } = browser.tabs;
  vi.spyOn(query, "query").mockImplementation(async (filter) =>
    "url" in filter ? (tabs.panel ? [tabs.panel] : []) : [tabs.active],
  );
}

describe("Painel lateral", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    commands.clear();
  });

  it("pede acesso só ao site da aba ativa e passa a agir nela com a permissão", async () => {
    const granted = new Set<string>();
    const permissions = mockPermissions(granted);
    mockTabs({ active: SITE_TAB });
    mockScripts(granted);
    const user = userEvent.setup();
    render(<ExtensionPopup surface="side-panel" />);
    const access = await screen.findByRole("region", {
      name: "Acesso a esta aba",
    });
    expect(access).toHaveTextContent(
      "A extensão ainda não tem acesso a loja.example.com.",
    );
    expect(
      screen.queryByRole("region", { name: "Formulários da página" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir no painel lateral" }),
    ).not.toBeInTheDocument();
    permissions.request.mockResolvedValueOnce(false);
    await user.click(
      within(access).getByRole("button", {
        name: "Permitir acesso a este site",
      }),
    );
    expect(
      await within(access).findByText(
        "O acesso a loja.example.com não foi permitido. Sem ele, o painel lateral não age nesta aba; o popup, pelo ícone da extensão, continua funcionando.",
      ),
    ).toBeVisible();
    permissions.request.mockImplementationOnce(async () => {
      granted.add("https://loja.example.com/*");
      permissions.notify();

      return true;
    });
    await user.click(
      within(access).getByRole("button", {
        name: "Permitir acesso a este site",
      }),
    );
    expect(
      await screen.findByRole("region", { name: "Formulários da página" }),
    ).toBeVisible();
    expect(await screen.findByText("Formulário de seção")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Acesso a esta aba" }),
    ).not.toBeInTheDocument();
    expect(permissions.request.mock.calls).toEqual([
      [{ origins: ["https://loja.example.com/*"] }],
      [{ origins: ["https://loja.example.com/*"] }],
    ]);
  });

  it("diz quando a aba não é uma página https", async () => {
    mockPermissions(new Set());
    mockTabs({ active: { id: 9, url: "chrome://extensions/" } });
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    render(<ExtensionPopup surface="side-panel" />);
    expect(
      await screen.findByText(
        "O painel lateral só age em páginas https. Em outras páginas web, use o popup, pelo ícone da extensão.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Permitir acesso a este site" }),
    ).not.toBeInTheDocument();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("acompanha a aba ativa e mantém o estado de cada seção", async () => {
    const granted = new Set([
      "https://admin.autodromo.com.br/*",
      "https://loja.example.com/*",
    ]);
    mockPermissions(granted);
    const active: { active: object } = { active: SITE_TAB };
    mockTabs(active);
    const executeScript = mockScripts(granted);
    const user = userEvent.setup();
    render(<ExtensionPopup surface="side-panel" />);
    expect(await screen.findByText("Formulário de seção")).toBeVisible();
    expect(countDetections(executeScript)).toBe(1);

    active.active = PANEL_TAB;
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 8, windowId: 0 });
    const integrations = await screen.findByRole("region", {
      name: "Integrações dos leads",
    });
    expect(
      screen.queryByRole("region", { name: "Formulários da página" }),
    ).not.toBeInTheDocument();
    await user.type(
      within(integrations).getByRole("searchbox", {
        name: "Busca (opcional)",
      }),
      "Bruna{Enter}",
    );
    expect(await screen.findByText("1 lead verificado.")).toBeVisible();

    active.active = SITE_TAB;
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 7, windowId: 0 });
    expect(
      await screen.findByRole("region", { name: "Formulários da página" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Integrações dos leads" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Formulário de seção")).toBeVisible();
    expect(countDetections(executeScript)).toBe(1);

    active.active = PANEL_TAB;
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 8, windowId: 0 });
    expect(await screen.findByText("1 lead verificado.")).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
    ).toHaveValue("Bruna");

    const otherAccount = {
      ...PANEL_TAB,
      url: "https://admin.autodromo.com.br/#/contas/22222222-2222-4222-8222-222222222222/leads",
    };
    active.active = otherAccount;
    await fakeBrowser.tabs.onUpdated.trigger(
      8,
      { url: otherAccount.url },
      otherAccount as never,
    );
    await waitFor(() =>
      expect(screen.queryByText("1 lead verificado.")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("searchbox", { name: "Busca (opcional)" }),
    ).toHaveValue("Bruna");

    active.active = SITE_TAB;
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 7, windowId: 0 });
    expect(await screen.findByText("Formulário de seção")).toBeVisible();
    expect(countDetections(executeScript)).toBe(1);
    active.active = { ...SITE_TAB, url: SITE_TAB.url + "/obrigado" };
    await fakeBrowser.tabs.onUpdated.trigger(
      7,
      { url: SITE_TAB.url + "/obrigado" },
      active.active as never,
    );
    await waitFor(() => expect(countDetections(executeScript)).toBe(2));
  });

  it("mostra no histórico o status do lead enviado, consultado na aba do painel em segundo plano", async () => {
    const granted = new Set([
      "https://admin.autodromo.com.br/*",
      "https://loja.example.com/*",
    ]);
    mockPermissions(granted);
    mockTabs({ active: SITE_TAB, panel: PANEL_TAB });
    const executeScript = mockScripts(granted);
    const user = userEvent.setup();
    render(<ExtensionPopup surface="side-panel" />);
    await user.click(
      await screen.findByRole("button", { name: "Enviar teste" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar envio" }));
    const message = await screen.findByText(
      /^Envio LT-\d{8}-\d{6}-001 disparado\./,
    );
    const id = /LT-\d{8}-\d{6}-001/.exec(message.textContent)?.[0] ?? "";
    const tracking = await screen.findByRole("group", {
      name: "Acompanhamento no painel",
    });
    await waitFor(() => expect(tracking).toHaveTextContent("No painel: OK"));
    expect(tracking).toHaveTextContent("Syonet — OK");
    const panelQueries = executeScript.mock.calls
      .map(([injection]) => injection as { target: object } & Injection)
      .filter(
        ({ args, target }) => args && "tabId" in target && target.tabId === 8,
      )
      .map(({ args }) => args?.[1]);
    expect(panelQueries).toEqual([{ limit: 5, search: id }]);
  });
});

describe("Popup e preferências", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("abre o painel lateral no gesto do usuário e fecha o popup", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([SITE_TAB]);
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async () => [
        {
          documentId: "document",
          frameId: 0,
          result: { ok: true, result: [] },
        },
      ],
    );
    vi.spyOn(windows, "getCurrent").mockResolvedValue({
      alwaysOnTop: false,
      focused: true,
      id: 3,
      incognito: false,
    });
    const sidePanel: {
      open: (options: { windowId: number }) => Promise<void>;
    } = browser.sidePanel;
    const open = vi
      .spyOn(sidePanel, "open")
      .mockRejectedValueOnce(new Error("Indisponível"))
      .mockResolvedValueOnce(undefined);
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<ExtensionPopup surface="popup" />);
    const button = await screen.findByRole("button", {
      name: "Abrir no painel lateral",
    });
    await user.click(button);
    expect(
      await screen.findByText(
        "Não foi possível abrir o painel lateral neste navegador. Continue pelo popup ou tente de novo.",
      ),
    ).toBeVisible();
    expect(close).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(open.mock.calls).toEqual([[{ windowId: 3 }], [{ windowId: 3 }]]);
  });

  it("grava a opção de atualização automática, ativada por padrão", async () => {
    vi.spyOn(tabs, "query").mockResolvedValue([SITE_TAB]);
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async () => [
        {
          documentId: "document",
          frameId: 0,
          result: { ok: true, result: [] },
        },
      ],
    );
    const user = userEvent.setup();
    render(<ExtensionPopup surface="popup" />);
    const option = screen.getByRole("switch", {
      name: "Atualizar automaticamente",
    });
    await waitFor(() => expect(option).toBeChecked());
    await expect(fakeBrowser.storage.local.get("autoRefresh")).resolves.toEqual(
      {},
    );
    await user.click(option);
    expect(option).not.toBeChecked();
    await expect(fakeBrowser.storage.local.get("autoRefresh")).resolves.toEqual(
      { autoRefresh: false },
    );
  });

  it("não acompanha o envio com a atualização automática desativada", async () => {
    await fakeBrowser.storage.local.set({ autoRefresh: false });
    const granted = new Set(["https://admin.autodromo.com.br/*"]);
    mockPermissions(granted);
    mockTabs({ active: SITE_TAB, panel: PANEL_TAB });
    const executeScript = mockScripts(granted);
    const user = userEvent.setup();
    render(<ExtensionPopup surface="popup" />);
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Atualizar automaticamente" }),
      ).not.toBeChecked(),
    );
    await user.click(
      await screen.findByRole("button", { name: "Enviar teste" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar envio" }));
    await screen.findByText(/^Envio LT-\d{8}-\d{6}-001 disparado\./);
    expect(
      screen.queryByRole("group", { name: "Acompanhamento no painel" }),
    ).not.toBeInTheDocument();
    expect(
      executeScript.mock.calls.filter(
        ([injection]) => (injection.target as { tabId: number }).tabId === 8,
      ),
    ).toEqual([]);
  });
});
