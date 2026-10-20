import { describe, expect, it } from "vitest";

import { classifySite } from "@/lib/site-environment";

describe("Ambiente do site", () => {
  it.each([
    "https://af9a881c-e4a2-4e55-bcc1-5ff1d0b5d08d.preview-v2.autodromo.com.br/",
    "https://loja.preview-v2.autodromo.com.br/ofertas?id=1#topo",
  ])("reconhece o site de testes em %s", (pageUrl) => {
    expect(classifySite(pageUrl)).toEqual({
      host: new URL(pageUrl).host,
      kind: "test",
    });
  });

  it.each([
    [
      "http://loja.preview-v2.autodromo.com.br/",
      "loja.preview-v2.autodromo.com.br",
    ],
    ["http://127.0.0.1:4173/", "127.0.0.1:4173"],
    ["https://admin.autodromo.com.br/#/contas", "admin.autodromo.com.br"],
    ["https://preview-v2.autodromo.com.br/", "preview-v2.autodromo.com.br"],
    [
      "https://preview-v2.autodromo.com.br.example.com/",
      "preview-v2.autodromo.com.br.example.com",
    ],
    ["https://www.concessionaria.com.br/", "www.concessionaria.com.br"],
    ["https://xpreview-v2.autodromo.com.br/", "xpreview-v2.autodromo.com.br"],
  ])("trata %s como site de cliente", (pageUrl, host) => {
    expect(classifySite(pageUrl)).toEqual({ host, kind: "production" });
  });

  it.each(["", "não é endereço"])(
    "trata o endereço desconhecido %j como site de cliente",
    (pageUrl) => {
      expect(classifySite(pageUrl)).toEqual({ host: "", kind: "production" });
    },
  );
});
