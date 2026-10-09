import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  createPanelCookies,
  PANEL_ACCOUNT_ID,
  PANEL_ACTOR_EMAIL,
  PANEL_CONTACT_IDS,
  PANEL_LEADS_URL,
  PANEL_REFRESH_TOKEN,
  PANEL_TEST_SUBMISSION_ID,
  panelConversions,
  panelHistories,
} from "@tests/fixtures/panel";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type ActionPopup = { close: () => Promise<void>; page: Page };

type ExtensionApi = {
  scripting: {
    executeScript: (injection: object) => Promise<{ result?: unknown }[]>;
  };
  storage: Record<
    "local" | "session" | "sync",
    { get: (keys: null) => Promise<object> }
  >;
  tabs: { query: (query: object) => Promise<{ id?: number }[]> };
};

type FixtureSession = {
  close: () => Promise<void>;
  context: BrowserContext;
  extensionId: string;
  origin: string;
  page: Page;
  userDataDir: string;
};

type PanelMock = {
  requests: { headers: Record<string, string>; method: string; url: string }[];
  setSession: (expiresAt: number) => Promise<PanelTokens>;
  state: { status?: number; submissionId?: string };
};

type PanelTokens = { accessToken: string; idToken: string };

const PANEL_API_ORIGIN = "https://crmv3.autodromo.com.br";
const PANEL_ORIGIN = "https://admin.autodromo.com.br";
const PANEL_ACCOUNTS_URL = PANEL_ORIGIN + "/#/contas";

async function mockPanel(context: BrowserContext): Promise<PanelMock> {
  const panelPage = await readFile(resolve("tests/fixtures/panel-leads.html"));
  const requests: PanelMock["requests"] = [];
  const state: PanelMock["state"] = {};

  await context.route(PANEL_ORIGIN + "/**", (route) =>
    route.fulfill({
      body: panelPage,
      contentType: "text/html; charset=utf-8",
    }),
  );
  await context.route(PANEL_API_ORIGIN + "/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const body =
      pathname === "/conversions"
        ? {
            ...panelConversions,
            data: panelConversions.data.map((lead, index) =>
              index === 1 && state.submissionId
                ? {
                    ...lead,
                    email: state.submissionId.toLowerCase() + "@example.com",
                    name: "Teste " + state.submissionId,
                  }
                : lead,
            ),
          }
        : panelHistories[pathname.split("/")[2] ?? ""];
    requests.push({
      headers: await request.allHeaders(),
      method: request.method(),
      url: request.url(),
    });
    await route.fulfill({
      body: JSON.stringify(body ?? { message: "Internal server error" }),
      contentType: "application/json",
      headers: {
        "access-control-allow-credentials": "true",
        "access-control-allow-origin": PANEL_ORIGIN,
      },
      status: state.status ?? (body ? 200 : 500),
    });
  });

  return {
    requests,
    setSession: async (expiresAt) => {
      const cookies = createPanelCookies({ expiresAt });
      await context.clearCookies();
      await context.addCookies(
        cookies.map((cookie) => ({
          ...cookie,
          domain: new URL(PANEL_ORIGIN).hostname,
          path: "/",
          secure: true,
        })),
      );

      return {
        accessToken:
          cookies.find(({ name }) => name.endsWith(".accessToken"))?.value ??
          "",
        idToken:
          cookies.find(({ name }) => name.endsWith(".idToken"))?.value ?? "",
      };
    },
    state,
  };
}

async function openActionPopup(
  context: BrowserContext,
  extensionId: string,
  tabUrl: string,
  userDataDir: string,
): Promise<ActionPopup> {
  const browser = context.browser();

  if (!browser) {
    throw new Error("Navegador indisponível para abrir o popup.");
  }

  const session = await browser.newBrowserCDPSession();
  const { targetInfos } = await session.send("Target.getTargets", {
    filter: [{ type: "tab" }],
  });
  const tab = targetInfos.find((target) => target.url === tabUrl);

  if (!tab) {
    throw new Error("Aba de teste não encontrada.");
  }

  await session.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: tab.targetId,
  });
  await session.detach();

  const [port] = (
    await readFile(join(userDataDir, "DevToolsActivePort"), "utf8")
  ).split("\n");
  const popupUrl = "chrome-extension://" + extensionId + "/popup.html";
  let popup: ActionPopup | undefined;

  await expect(async () => {
    const inspector = await chromium.connectOverCDP("http://127.0.0.1:" + port);
    const page = inspector
      .contexts()
      .flatMap((inspected) => inspected.pages())
      .find((candidate) => candidate.url() === popupUrl);

    if (!page) {
      await inspector.close();
      throw new Error("Popup da extensão ainda não está disponível.");
    }

    popup = {
      close: async () => {
        await page.close();
        await inspector.close();
      },
      page,
    };
  }).toPass();

  if (!popup) {
    throw new Error("Popup da extensão não encontrado.");
  }

  return popup;
}

async function openFixturePage(): Promise<FixtureSession> {
  const extensionPath = resolve(".output/chrome-mv3");
  const fixture = await readFile(resolve("tests/fixtures/lead-forms.html"));
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      request.url === "/"
        ? fixture
        : "<!doctype html><title>Sem formulários</title><h1>Sem formulários</h1>",
    );
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  const origin =
    "http://127.0.0.1:" +
    (typeof address === "object" && address ? address.port : "");
  const userDataDir = await mkdtemp(join(tmpdir(), "lead-integration-tester-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      "--disable-extensions-except=" + extensionPath,
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "--load-extension=" + extensionPath,
      "--remote-debugging-port=0",
    ],
    channel: "chromium",
    headless: true,
  });
  const close = async () => {
    await context.close();
    server.close();
    await rm(userDataDir, { force: true, recursive: true });
  };

  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const page = await context.newPage();
    await page.goto(origin + "/");

    return {
      close,
      context,
      extensionId: new URL(worker.url()).host,
      origin,
      page,
      userDataDir,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

test("verifica a extensão instalada com o background real", async () => {
  const extensionPath = resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    args: [
      "--disable-extensions-except=" + extensionPath,
      "--load-extension=" + extensionPath,
    ],
    channel: "chromium",
    headless: true,
  });

  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto("chrome-extension://" + extensionId + "/popup.html");
    await expect(
      page.getByRole("heading", { name: "Scanner de Leads" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Verificar extensão" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Extensão conectada ao background.",
    );
  } finally {
    await context.close();
  }
});

test("envia formulários da aba ativa pelo popup e mantém o histórico", async () => {
  const { close, context, extensionId, origin, page, userDataDir } =
    await openFixturePage();

  try {
    const submissions = page.getByRole("list", { name: "Envios recebidos" });

    let popup = await openActionPopup(
      context,
      extensionId,
      origin + "/",
      userDataDir,
    );
    let forms = popup.page.getByRole("region", {
      name: "Formulários da página",
    });
    let history = popup.page.getByRole("region", {
      name: "Histórico de envios",
    });
    await expect(forms.getByRole("listitem")).toHaveText([
      /Formulário de oferta.*oferta - GEELY EX5 PRO - Enviar/,
      /Formulário de seção.*Título da seção - Enviar/,
      /Formulário de oferta.*oferta - GEELY EX2 - Enviar/,
      /Formulário de seção.*CRETA 1\.0 TGDI FLEX COMFORT - Enviar/,
    ]);
    await expect(history).toContainText("Nenhum envio registrado.");

    await forms
      .getByRole("listitem")
      .filter({ hasText: "Título da seção - Enviar" })
      .getByRole("button", { name: "Enviar teste" })
      .click();
    await expect(forms).toContainText(/Envio LT-\d{8}-\d{6}-001 disparado\./);
    const firstId =
      /LT-\d{8}-\d{6}-001/.exec(await forms.innerText())?.[0] ?? "";
    await expect(submissions.getByRole("listitem")).toHaveCount(1);
    const first: unknown = JSON.parse(
      await submissions.getByRole("listitem").first().innerText(),
    );
    expect(first).toEqual({
      data: {
        accountId: "account-fixture",
        channel: "Home",
        "contactPreference[]": ["email", "whatsapp", "telefone"],
        cpf: expect.stringMatching(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
        email: firstId.toLowerCase() + "@example.com",
        "marketingConsent[]": ["true"],
        name: "Teste " + firstId,
        origin_url: "",
        phone: expect.stringMatching(/^\(11\) 9\d{4}-\d{4}$/),
        product: "Página Inicial",
        siteId: "site-fixture",
        teamId: "team-fixture",
        unit: "unit-fixture",
      },
      form: "Título da seção - Enviar",
      valid: true,
    });
    await expect(history.getByRole("listitem")).toHaveCount(1);
    await expect(history.getByRole("listitem").first()).toContainText(firstId);
    await expect(history.getByRole("listitem").first()).toContainText(
      "Teste " + firstId,
    );

    await forms
      .getByRole("listitem")
      .filter({ hasText: "oferta - GEELY EX2 - Enviar" })
      .getByRole("button", { name: "Enviar teste" })
      .click();
    await expect(forms).toContainText(/Envio LT-\d{8}-\d{6}-002 disparado\./);
    const secondId =
      /LT-\d{8}-\d{6}-002/.exec(await forms.innerText())?.[0] ?? "";
    await expect(submissions.getByRole("listitem")).toHaveCount(2);
    const second: unknown = JSON.parse(
      await submissions.getByRole("listitem").last().innerText(),
    );
    expect(second).toEqual({
      data: {
        email: secondId.toLowerCase() + "@example.com",
        mailing: "on",
        name: "Teste " + secondId,
        phone: expect.stringMatching(/^\(11\) 9\d{4}-\d{4}$/),
        phoning: "on",
        whatsapping: "on",
      },
      form: "oferta - GEELY EX2 - Enviar",
      valid: true,
    });
    await expect(history.getByRole("listitem")).toHaveText([
      new RegExp(secondId),
      new RegExp(firstId),
    ]);

    await popup.close();
    await page.goto(origin + "/vazio");
    popup = await openActionPopup(
      context,
      extensionId,
      origin + "/vazio",
      userDataDir,
    );
    forms = popup.page.getByRole("region", { name: "Formulários da página" });
    history = popup.page.getByRole("region", { name: "Histórico de envios" });
    await expect(forms).toContainText(
      "Nenhum formulário reconhecido nesta página.",
    );
    await expect(forms.getByRole("listitem")).toHaveCount(0);
    await expect(history.getByRole("listitem")).toHaveText([
      new RegExp(secondId),
      new RegExp(firstId),
    ]);
    await popup.close();
  } finally {
    await close();
  }
});

test("lista o formulário do modal só depois de aberto na página e o envia", async () => {
  const { close, context, extensionId, origin, page, userDataDir } =
    await openFixturePage();

  try {
    const submissions = page.getByRole("list", { name: "Envios recebidos" });

    let popup = await openActionPopup(
      context,
      extensionId,
      origin + "/",
      userDataDir,
    );
    let forms = popup.page.getByRole("region", {
      name: "Formulários da página",
    });
    await expect(forms.getByRole("listitem")).toHaveCount(4);
    await expect(forms).not.toContainText("contact-form-modal");
    await popup.close();

    await page.getByRole("button", { name: "Abrir WhatsApp" }).click();
    await expect(
      page.getByRole("heading", { name: "Fale por WhatsApp" }),
    ).toBeVisible();
    popup = await openActionPopup(
      context,
      extensionId,
      origin + "/",
      userDataDir,
    );
    forms = popup.page.getByRole("region", { name: "Formulários da página" });
    const history = popup.page.getByRole("region", {
      name: "Histórico de envios",
    });
    const form = forms
      .getByRole("listitem")
      .filter({ hasText: "contact-form-modal - Fale por WhatsApp" });
    await expect(forms.getByRole("listitem")).toHaveCount(5);
    await expect(form).toContainText("Formulário de modal de contato");
    await expect(
      page.getByRole("heading", { name: "Fale por WhatsApp" }),
    ).toBeVisible();

    await form.getByRole("button", { name: "Enviar teste" }).click();
    await expect(forms).toContainText(/Envio LT-\d{8}-\d{6}-001 disparado\./);
    await expect(forms).not.toContainText("que a extensão não preencheu");
    const firstId =
      /LT-\d{8}-\d{6}-001/.exec(await forms.innerText())?.[0] ?? "";
    await expect(submissions.getByRole("listitem")).toHaveCount(1);
    const first: unknown = JSON.parse(
      await submissions.getByRole("listitem").first().innerText(),
    );
    expect(first).toEqual({
      data: {
        dataPermissions: "on",
        email: firstId.toLowerCase() + "@example.com",
        mailing: "on",
        name: "Teste " + firstId,
        phone: expect.stringMatching(/^\(11\) 9\d{4}-\d{4}$/),
        phoning: "on",
        whatsapping: "on",
      },
      form: "contact-form-modal - Fale por WhatsApp - iniciar conversa",
      valid: true,
    });
    await expect(history.getByRole("listitem")).toHaveCount(1);
    await expect(history.getByRole("listitem").first()).toContainText(firstId);

    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(
      page.getByRole("heading", { name: "Fale por WhatsApp" }),
    ).toHaveCount(0);
    await form.getByRole("button", { name: "Enviar teste" }).click();
    await expect(forms).toContainText(
      "O formulário escolhido não está mais na página. Atualize a lista.",
    );
    await expect(submissions.getByRole("listitem")).toHaveCount(1);

    await forms.getByRole("button", { name: "Atualizar lista" }).click();
    await expect(forms.getByRole("listitem")).toHaveCount(4);
    await expect(forms).not.toContainText("contact-form-modal");
    await popup.close();
  } finally {
    await close();
  }
});

test("preenche caixa de texto e seletor, com a opção escolhida no popup", async () => {
  const { close, context, extensionId, origin, page, userDataDir } =
    await openFixturePage();

  try {
    const submissions = page.getByRole("list", { name: "Envios recebidos" });
    const popup = await openActionPopup(
      context,
      extensionId,
      origin + "/",
      userDataDir,
    );
    const forms = popup.page.getByRole("region", {
      name: "Formulários da página",
    });
    const history = popup.page.getByRole("region", {
      name: "Histórico de envios",
    });
    const form = forms
      .getByRole("listitem")
      .filter({ hasText: "CRETA 1.0 TGDI FLEX COMFORT - Enviar" });
    const unit = form.getByRole("combobox", { name: "Unidade" });
    await expect(forms.getByRole("combobox")).toHaveCount(1);
    await expect(unit).toHaveText("Nenhuma");

    await form.getByRole("button", { name: "Enviar teste" }).click();
    await expect(forms).toContainText(/Envio LT-\d{8}-\d{6}-001 disparado\./);
    await expect(forms).toContainText(
      "Campo do formulário que a extensão não preencheu: bestTime.",
    );
    const firstId =
      /LT-\d{8}-\d{6}-001/.exec(await forms.innerText())?.[0] ?? "";
    await expect(submissions.getByRole("listitem")).toHaveCount(1);
    const first: unknown = JSON.parse(
      await submissions.getByRole("listitem").first().innerText(),
    );
    expect(first).toEqual({
      data: {
        accountId: "account-fixture",
        bestTime: "",
        category: "Seminovos",
        channel: "Seminovos",
        "contactPreference[]": ["email", "whatsapp", "telefone"],
        content_entry_id: "entry-fixture",
        email: firstId.toLowerCase() + "@example.com",
        "marketingConsent[]": ["true"],
        message: "Lead de teste " + firstId + ".",
        name: "Teste " + firstId,
        origin_url: "",
        phone: expect.stringMatching(/^\(11\) 9\d{4}-\d{4}$/),
        product: "CRETA 1.0 TGDI",
        siteId: "site-fixture",
        teamId: "team-fixture",
        unit: "",
      },
      form: "CRETA 1.0 TGDI FLEX COMFORT - Enviar",
      valid: true,
    });
    await expect(history.getByRole("listitem").first()).toContainText(
      "Selecione a unidade (sem valor)",
    );

    await unit.click();
    await expect(popup.page.getByRole("option")).toHaveText([
      "Nenhuma",
      "Unidade Afogados",
      "Unidade Boa Viagem",
      "Unidade Caruaru",
    ]);
    await popup.page
      .getByRole("option", { name: "Unidade Boa Viagem" })
      .click();
    await expect(unit).toHaveText("Unidade Boa Viagem");
    await form.getByRole("button", { name: "Enviar teste" }).click();
    await expect(forms).toContainText(/Envio LT-\d{8}-\d{6}-002 disparado\./);
    const secondId =
      /LT-\d{8}-\d{6}-002/.exec(await forms.innerText())?.[0] ?? "";
    await expect(submissions.getByRole("listitem")).toHaveCount(2);
    const second: unknown = JSON.parse(
      await submissions.getByRole("listitem").last().innerText(),
    );
    expect(second).toMatchObject({
      data: {
        message: "Lead de teste " + secondId + ".",
        name: "Teste " + secondId,
        unit: "unit-boa-viagem",
      },
      valid: true,
    });
    await expect(history.getByRole("listitem").first()).toContainText(
      "Unidade Boa Viagem (unit-boa-viagem)",
    );
    await expect(history.getByRole("listitem").first()).toContainText(
      "Lead de teste " + secondId + ".",
    );
    await popup.close();
  } finally {
    await close();
  }
});

test("verifica no painel as integrações dos leads sem expor a sessão", async () => {
  const { close, context, extensionId, origin, page, userDataDir } =
    await openFixturePage();

  try {
    const panel = await mockPanel(context);
    const { accessToken, idToken } = await panel.setSession(
      Date.now() + 3600000,
    );
    let popup = await openActionPopup(
      context,
      extensionId,
      origin + "/",
      userDataDir,
    );
    const forms = popup.page.getByRole("region", {
      name: "Formulários da página",
    });
    await forms
      .getByRole("listitem")
      .filter({ hasText: "Título da seção - Enviar" })
      .getByRole("button", { name: "Enviar teste" })
      .click();
    await expect(forms).toContainText(/Envio LT-\d{8}-\d{6}-001 disparado\./);
    await expect(
      popup.page.getByRole("region", { name: "Integrações dos leads" }),
    ).toHaveCount(0);
    const submissionId =
      /LT-\d{8}-\d{6}-001/.exec(await forms.innerText())?.[0] ?? "";
    panel.state.submissionId = submissionId;
    await popup.close();

    await page.goto(PANEL_LEADS_URL);
    popup = await openActionPopup(
      context,
      extensionId,
      PANEL_LEADS_URL,
      userDataDir,
    );
    const integrations = popup.page.getByRole("region", {
      name: "Integrações dos leads",
    });
    const verify = integrations.getByRole("button", {
      name: "Verificar integrações",
    });
    await expect(verify).toBeVisible();
    await expect(
      popup.page.getByRole("region", { name: "Formulários da página" }),
    ).toHaveCount(0);
    await expect(
      popup.page
        .getByRole("region", { name: "Histórico de envios" })
        .getByRole("listitem"),
    ).toHaveText([new RegExp(submissionId)]);
    expect(panel.requests).toEqual([]);

    await verify.click();
    await expect(integrations).toContainText("6 leads verificados.");
    await expect(
      integrations
        .getByRole("list", { name: "Resumo por status" })
        .getByRole("listitem"),
    ).toHaveText([
      "OK: 2",
      "Erro: 1",
      "Pendente: 1",
      "Sem evento: 1",
      "Não consultado: 1",
    ]);
    const cards = integrations
      .getByRole("list", { name: "Leads verificados" })
      .locator(":scope > li");
    await expect(cards).toHaveCount(6);
    await expect(cards.nth(0)).toContainText(
      "Lead de teste " +
        PANEL_TEST_SUBMISSION_ID +
        " · não consta no histórico de envios desta extensão",
    );
    await expect(
      cards
        .nth(0)
        .getByRole("list", { name: "Integrações" })
        .getByRole("listitem"),
    ).toHaveText([
      "My Honda — OK",
      "RD Station — Erro: Parâmetros incompletos [ 3f9a1c ]",
    ]);
    await expect(cards.nth(1)).toContainText("Teste " + submissionId);
    await expect(cards.nth(1)).toContainText(
      "Lead de teste " + submissionId + " · consta no histórico de envios",
    );
    await expect(
      cards
        .nth(1)
        .getByRole("list", { name: "Integrações" })
        .getByRole("listitem"),
    ).toHaveText(["Syonet — OK"]);
    await expect(cards.nth(2)).toContainText("RD Station — Pendente");
    await expect(cards.nth(3)).toContainText(
      "Nenhum evento de integração para este lead.",
    );
    await expect(cards.nth(4)).not.toContainText("Lead de teste");
    await expect(
      cards
        .nth(4)
        .getByRole("list", { name: "Integrações" })
        .getByRole("listitem"),
    ).toHaveText(["My Honda — OK", "RD Station — OK"]);
    await expect(cards.nth(5)).toContainText(
      "Não foi possível consultar as integrações deste lead.",
    );
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-page-fetch",
      "called",
    );

    expect(panel.requests).toHaveLength(6);
    expect(panel.requests[0]?.url).toBe(
      PANEL_API_ORIGIN +
        "/conversions?accountId=" +
        PANEL_ACCOUNT_ID +
        "&limit=10&page=1",
    );
    expect(
      panel.requests
        .slice(1)
        .map(({ url }) => url)
        .sort(),
    ).toEqual(
      Object.values(PANEL_CONTACT_IDS)
        .map(
          (contactId) =>
            PANEL_API_ORIGIN +
            "/contacts/" +
            contactId +
            "/integration-histories?accountId=" +
            PANEL_ACCOUNT_ID,
        )
        .sort(),
    );

    const exposed = await popup.page.evaluate(async () => {
      const extension: ExtensionApi = Reflect.get(globalThis, "chrome");
      const [tab] = await extension.tabs.query({
        active: true,
        currentWindow: true,
      });
      const [injection] = await extension.scripting.executeScript({
        files: ["/lead-integrations.js"],
        target: { tabId: tab?.id },
      });

      return JSON.stringify({
        response: injection?.result,
        storage: [
          await extension.storage.local.get(null),
          await extension.storage.session.get(null),
          await extension.storage.sync.get(null),
        ],
      });
    });
    const exposure: { response: unknown; storage: object[] } =
      JSON.parse(exposed);
    const popupContent = await popup.page.content();
    expect(exposure.response).toMatchObject({
      ok: true,
      result: { leads: { length: 6 } },
    });

    for (const secret of [
      accessToken,
      idToken,
      PANEL_ACTOR_EMAIL,
      PANEL_REFRESH_TOKEN,
      "Bearer",
      "CognitoIdentityServiceProvider",
      ...accessToken.split("."),
    ]) {
      expect(exposed).not.toContain(secret);
      expect(popupContent).not.toContain(secret);
    }

    expect(exposure.storage.map((area) => Object.keys(area).sort())).toEqual([
      ["submissionHistory", "submissionSequence"],
      [],
      [],
    ]);

    for (const panelData of [
      "bruna.exemplo@example.com",
      "Caio Fictício",
      "11900000004",
      "Enzo Amostra",
      "Parâmetros incompletos",
      PANEL_TEST_SUBMISSION_ID,
    ]) {
      expect(popupContent).toContain(panelData);
      expect(JSON.stringify(exposure.storage)).not.toContain(panelData);
    }

    expect(panel.requests).toHaveLength(12);

    for (const { headers, method, url } of panel.requests) {
      expect(method).toBe("GET");
      expect(new URL(url).origin).toBe(PANEL_API_ORIGIN);
      expect(headers).toMatchObject({
        authorization: "Bearer " + accessToken,
        origin: PANEL_ORIGIN,
        "x-actor-email": PANEL_ACTOR_EMAIL,
      });
      expect(headers.cookie).toBeUndefined();
      expect(headers["x-actor-name"]).toBeUndefined();
    }

    await popup.close();
  } finally {
    await close();
  }
});

test("informa no painel a sessão ausente ou expirada, o acesso negado e a conta ausente", async () => {
  const { close, context, extensionId, page, userDataDir } =
    await openFixturePage();

  try {
    const panel = await mockPanel(context);
    await panel.setSession(Date.now() - 60000);
    await page.goto(PANEL_LEADS_URL);
    let popup = await openActionPopup(
      context,
      extensionId,
      PANEL_LEADS_URL,
      userDataDir,
    );
    let integrations = popup.page.getByRole("region", {
      name: "Integrações dos leads",
    });
    await integrations
      .getByRole("button", { name: "Verificar integrações" })
      .click();
    await expect(integrations).toContainText(
      "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
    );
    await expect(integrations.getByRole("list")).toHaveCount(0);

    await context.clearCookies();
    await integrations
      .getByRole("button", { name: "Verificar integrações" })
      .click();
    await expect(integrations).toContainText(
      "Sessão do painel não encontrada. Recarregue o painel ou entre de novo.",
    );
    expect(panel.requests).toEqual([]);

    await panel.setSession(Date.now() + 3600000);
    panel.state.status = 401;
    await integrations
      .getByRole("button", { name: "Verificar integrações" })
      .click();
    await expect(integrations).toContainText(
      "A sessão do painel expirou. Recarregue o painel ou entre de novo.",
    );
    expect(panel.requests).toHaveLength(1);

    panel.state.status = 403;
    await integrations
      .getByRole("button", { name: "Verificar integrações" })
      .click();
    await expect(integrations).toContainText(
      "O seu usuário não tem acesso aos leads desta conta no painel.",
    );
    expect(panel.requests).toHaveLength(2);
    await popup.close();

    panel.state.status = undefined;
    await page.goto(PANEL_ACCOUNTS_URL);
    popup = await openActionPopup(
      context,
      extensionId,
      PANEL_ACCOUNTS_URL,
      userDataDir,
    );
    integrations = popup.page.getByRole("region", {
      name: "Integrações dos leads",
    });
    await integrations
      .getByRole("button", { name: "Verificar integrações" })
      .click();
    await expect(integrations).toContainText(
      "Abra a lista de leads de uma conta no painel e tente de novo.",
    );
    expect(panel.requests.map(({ method }) => method)).toEqual(["GET", "GET"]);
    await popup.close();
  } finally {
    await close();
  }
});
