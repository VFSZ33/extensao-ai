import { describe, expect, it } from "vitest";

import { isLeadLimit, parsePanelQuery } from "@/lib/panel-query";

describe("Consulta enviada ao painel", () => {
  it.each([5, 10, 20])("aceita a quantidade %i", (limit) => {
    expect(isLeadLimit(limit)).toBe(true);
    expect(parsePanelQuery({ limit, search: "" })).toEqual({
      limit,
      search: "",
    });
  });

  it.each([0, 1, 7, 50, "10", undefined, null])(
    "rejeita a quantidade %j",
    (limit) => {
      expect(isLeadLimit(limit)).toBe(false);
      expect(parsePanelQuery({ limit, search: "" })).toBeUndefined();
    },
  );

  it("remove os espaços das pontas da busca e mantém o texto", () => {
    expect(
      parsePanelQuery({ limit: 10, search: "  Bruna & ção=1?  " }),
    ).toEqual({ limit: 10, search: "Bruna & ção=1?" });
    expect(parsePanelQuery({ limit: 10, search: "a".repeat(100) })).toEqual({
      limit: 10,
      search: "a".repeat(100),
    });
  });

  it.each([
    undefined,
    null,
    [],
    "LT-20261008-141748-012",
    { limit: 10 },
    { limit: 10, search: 7 },
    { limit: 10, search: "a".repeat(101) },
    { limit: 10, search: "linha\nquebrada" },
    { limit: 10, search: "nulo\u0000" },
  ])("rejeita a consulta %j", (query) => {
    expect(parsePanelQuery(query)).toBeUndefined();
  });
});
