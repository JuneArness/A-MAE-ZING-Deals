// Minimal CSV reader/writer (RFC 4180: quoted fields, commas and line breaks inside quotes).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", i = 0, quoted = false;
  text = text.replace(/^﻿/, "");
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ",") { row.push(unguard(field)); field = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      row.push(unguard(field)); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++; continue;
    }
    field += c; i++;
  }
  row.push(unguard(field));
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// Undo the apostrophe that toCsv adds in front of =, +, -, @ so export -> import round-trips cleanly.
const unguard = (v: string) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Prevent spreadsheet formula injection when the file is opened in Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
