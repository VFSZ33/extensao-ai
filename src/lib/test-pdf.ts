const PDF_PRINTABLE_TEXT = /^[\x20-\x7e]*$/;

export function createTextPdf(lines: string[]): string {
  if (!lines.every((line) => PDF_PRINTABLE_TEXT.test(line))) {
    throw new Error("O PDF de teste aceita só texto ASCII.");
  }

  const stream = [
    "BT",
    "/F1 18 Tf",
    "24 TL",
    "72 770 Td",
    ...lines.map((line) => "(" + escapePdfText(line) + ") Tj T*"),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Pages 2 0 R /Type /Catalog >>",
    "<< /Count 1 /Kids [3 0 R] /Type /Pages >>",
    "<< /Contents 5 0 R /MediaBox [0 0 595 842] /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Type /Page >>",
    "<< /BaseFont /Helvetica /Subtype /Type1 /Type /Font >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += String(index + 1) + " 0 obj\n" + body + "\nendobj\n";

    return offset;
  });
  const xrefOffset = pdf.length;

  return (
    pdf +
    "xref\n0 " +
    String(objects.length + 1) +
    "\n0000000000 65535 f \n" +
    offsets
      .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Root 1 0 R /Size " +
    String(objects.length + 1) +
    " >>\nstartxref\n" +
    String(xrefOffset) +
    "\n%%EOF\n"
  );
}

function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, (character) => "\\" + character);
}
