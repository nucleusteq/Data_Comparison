"use client";

import type { RowDiffResponse } from "@/lib/api";

/** Trigger a browser download of `content` as a file. */
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const cellStr = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

/** Quote a CSV field if it contains a comma, quote, or newline. */
function csvCell(value: unknown): string {
  const s = cellStr(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A named table: header columns + rows of values. */
export interface Sheet {
  name: string;
  columns: string[];
  rows: unknown[][];
}

/** Build the three logical sheets (Changed cells, Only in A, Only in B). */
export function rowDiffSheets(data: RowDiffResponse): Sheet[] {
  const changed: Sheet = {
    name: "Changed cells",
    columns: ["key", "column", "value_a", "value_b"],
    rows: data.changed.flatMap((row) => {
      const key = Object.values(row.key).join(" / ");
      return Object.entries(row.differences).map(([col, v]) => [
        key,
        col,
        v.a,
        v.b,
      ]);
    }),
  };
  const onlyA = recordsToSheet("Only in A", data.only_in_a);
  const onlyB = recordsToSheet("Only in B", data.only_in_b);
  return [changed, onlyA, onlyB];
}

function recordsToSheet(name: string, records: Record<string, unknown>[]): Sheet {
  const columns = records.length ? Object.keys(records[0]) : [];
  return { name, columns, rows: records.map((r) => columns.map((c) => r[c])) };
}

function sheetToCsv(sheet: Sheet): string {
  const header = sheet.columns.map(csvCell).join(",");
  const body = sheet.rows.map((r) => r.map(csvCell).join(","));
  return [header, ...body].join("\n");
}

/** Render a sheet as a GitHub/Slack-friendly markdown table. */
function sheetToMarkdown(sheet: Sheet): string {
  if (!sheet.columns.length) return `_(no rows)_`;
  const head = `| ${sheet.columns.join(" | ")} |`;
  const sep = `| ${sheet.columns.map(() => "---").join(" | ")} |`;
  const body = sheet.rows.map(
    (r) => `| ${r.map((c) => cellStr(c).replace(/\|/g, "\\|")).join(" | ")} |`
  );
  return [head, sep, ...body].join("\n");
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// --------------------------------------------------------------------------- //
// Downloads
// --------------------------------------------------------------------------- //

/** Full result as JSON. */
export function exportRowDiffJson(data: RowDiffResponse) {
  download(
    `row-diff-${stamp()}.json`,
    JSON.stringify(data, null, 2),
    "application/json"
  );
}

/** All three sections in one sectioned CSV. */
export function exportRowDiffCsv(data: RowDiffResponse) {
  const parts = rowDiffSheets(data).flatMap((s) => [
    `# ${s.name}`,
    sheetToCsv(s),
    "",
  ]);
  download(`row-diff-${stamp()}.csv`, parts.join("\n"), "text/csv");
}

/** A single named section as its own CSV file. */
export function exportSheetCsv(sheet: Sheet) {
  const safe = sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  download(`${safe}-${stamp()}.csv`, sheetToCsv(sheet), "text/csv");
}

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Multi-sheet Excel export using the SpreadsheetML 2003 (.xls) XML format —
 * Excel opens it natively with one tab per section, no external library needed.
 */
export function exportRowDiffExcel(data: RowDiffResponse) {
  const sheetsXml = rowDiffSheets(data)
    .map((sheet) => {
      const headerRow = `<Row>${sheet.columns
        .map(
          (c) =>
            `<Cell><Data ss:Type="String">${xmlEscape(cellStr(c))}</Data></Cell>`
        )
        .join("")}</Row>`;
      const bodyRows = sheet.rows
        .map(
          (r) =>
            `<Row>${r
              .map(
                (c) =>
                  `<Cell><Data ss:Type="String">${xmlEscape(
                    cellStr(c)
                  )}</Data></Cell>`
              )
              .join("")}</Row>`
        )
        .join("");
      return `<Worksheet ss:Name="${xmlEscape(
        sheet.name
      )}"><Table>${headerRow}${bodyRows}</Table></Worksheet>`;
    })
    .join("");

  const xml =
    `<?xml version="1.0"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `${sheetsXml}</Workbook>`;

  download(`row-diff-${stamp()}.xls`, xml, "application/vnd.ms-excel");
}

// --------------------------------------------------------------------------- //
// Clipboard
// --------------------------------------------------------------------------- //

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy a single section to the clipboard as CSV. */
export function copySheetCsv(sheet: Sheet) {
  return copy(sheetToCsv(sheet));
}

/** Copy a single section to the clipboard as a markdown table. */
export function copySheetMarkdown(sheet: Sheet) {
  return copy(sheetToMarkdown(sheet));
}
