import { ReportResult } from "@/types/phase6";

function escapeCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function reportToCsv(report: ReportResult) {
  const header = report.columns.map(escapeCell).join(",");
  const rows = report.rows.map((row) =>
    report.columns.map((column) => escapeCell(row[column])).join(",")
  );
  return [header, ...rows].join("\n");
}

export function reportToExcelHtml(report: ReportResult) {
  const header = report.columns
    .map((column) => `<th>${column}</th>`)
    .join("");
  const rows = report.rows
    .map(
      (row) =>
        `<tr>${report.columns
          .map((column) => `<td>${row[column] ?? ""}</td>`)
          .join("")}</tr>`
    )
    .join("");

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>
          <thead><tr>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}

// Minimal valid PDF generator for text reports. It intentionally avoids adding
// a heavy dependency and is sufficient for tabular export snapshots.
export function reportToPdf(report: ReportResult) {
  const lines = [
    report.title,
    "",
    report.columns.join(" | "),
    ...report.rows.slice(0, 80).map((row) =>
      report.columns.map((column) => String(row[column] ?? "")).join(" | ")
    ),
  ];

  const content = lines
    .flatMap((line, index) => {
      const y = 780 - index * 14;
      if (y < 40) return [];
      return [`BT /F1 8 Tf 40 ${y} Td (${pdfEscape(line.slice(0, 120))}) Tj ET`];
    })
    .join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
