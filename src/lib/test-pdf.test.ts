import { describe, expect, it } from "vitest";

import { createTextPdf } from "@/lib/test-pdf";

describe("PDF de teste", () => {
  it("gera um PDF válido, com tabela de referências que aponta para cada objeto", () => {
    const pdf = createTextPdf(["Lead de teste", "LT-20261007-080509-012"]);
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1]);
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(
      ([, offset]) => Number(offset),
    );
    const stream = /stream\n([\s\S]*?)\nendstream/.exec(pdf)?.[1] ?? "";

    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.slice(startxref).startsWith("xref\n0 6\n")).toBe(true);
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset).startsWith(String(index + 1) + " 0 obj\n")).toBe(
        true,
      );
    });
    expect(pdf).toContain("<< /Length " + String(stream.length) + " >>");
    expect(stream).toContain("(Lead de teste) Tj T*");
    expect(stream).toContain("(LT-20261007-080509-012) Tj T*");
    expect(new Blob([pdf]).size).toBe(pdf.length);
    expect(pdf.length).toBeLessThan(2048);
  });

  it("escapa os caracteres reservados do texto", () => {
    expect(createTextPdf(["a (b) \\ c"])).toContain("(a \\(b\\) \\\\ c) Tj T*");
  });

  it("recusa texto fora do ASCII imprimível", () => {
    expect(() => createTextPdf(["Lead de teste ção"])).toThrow(
      "O PDF de teste aceita só texto ASCII.",
    );
  });
});
