import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import {
  readOriginPattern,
  readPageAccess,
  requestPageAccess,
} from "@/lib/page-access";

const permissions: {
  contains: (permissions: object) => Promise<boolean>;
  request: (permissions: object) => Promise<boolean>;
} = browser.permissions;

describe("Acesso por site", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it.each([
    [
      "https://loja.example.com/carros?modelo=1#topo",
      "https://loja.example.com/*",
    ],
    [
      "https://admin.autodromo.com.br/#/contas/1/leads",
      "https://admin.autodromo.com.br/*",
    ],
    ["https://loja.example.com:8443/", "https://loja.example.com:8443/*"],
  ])("pede só a origem de %s", (url, pattern) => {
    expect(readOriginPattern(url)).toBe(pattern);
  });

  it.each([
    "http://loja.example.com/",
    "chrome://extensions/",
    "file:///C:/leads.html",
    "about:blank",
    "",
  ])("não pede acesso em %j", (url) => {
    expect(readOriginPattern(url)).toBeUndefined();
  });

  it("reconhece o acesso concedido à origem sem tocar na página", async () => {
    const contains = vi.spyOn(permissions, "contains").mockResolvedValue(true);
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    await expect(
      readPageAccess(7, "https://loja.example.com/ofertas"),
    ).resolves.toBe("granted");
    expect(contains).toHaveBeenCalledWith({
      origins: ["https://loja.example.com/*"],
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("reconhece o acesso temporário da aba sem permissão da origem", async () => {
    vi.spyOn(permissions, "contains").mockResolvedValue(false);
    const executeScript = vi
      .spyOn(browser.scripting, "executeScript")
      .mockImplementation(async () => [
        { documentId: "document", frameId: 0, result: true },
      ]);
    await expect(readPageAccess(7, "http://127.0.0.1:4173/")).resolves.toBe(
      "granted",
    );
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 } }),
    );
  });

  it("indica o acesso que falta só em páginas https", async () => {
    vi.spyOn(permissions, "contains").mockRejectedValue(new Error("Falha"));
    vi.spyOn(browser.scripting, "executeScript").mockRejectedValue(
      new Error("Cannot access contents of the page."),
    );
    await expect(readPageAccess(7, "https://loja.example.com/")).resolves.toBe(
      "missing",
    );
    await expect(readPageAccess(7, "http://loja.example.com/")).resolves.toBe(
      "unsupported",
    );
  });

  it("não tenta acessar páginas que não são web", async () => {
    const executeScript = vi.spyOn(browser.scripting, "executeScript");
    await expect(readPageAccess(7, "chrome://extensions/")).resolves.toBe(
      "unsupported",
    );
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("pede ao navegador só a origem da aba e devolve a resposta", async () => {
    const request = vi
      .spyOn(permissions, "request")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      requestPageAccess("https://loja.example.com/ofertas?id=1"),
    ).resolves.toBe(true);
    await expect(
      requestPageAccess("https://admin.autodromo.com.br/#/contas"),
    ).resolves.toBe(false);
    expect(request.mock.calls).toEqual([
      [{ origins: ["https://loja.example.com/*"] }],
      [{ origins: ["https://admin.autodromo.com.br/*"] }],
    ]);
  });

  it("não pede acesso a página que não é https", async () => {
    const request = vi.spyOn(permissions, "request");
    await expect(requestPageAccess("http://loja.example.com/")).resolves.toBe(
      false,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
