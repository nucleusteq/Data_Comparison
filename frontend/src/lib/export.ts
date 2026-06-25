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

/** Quote a CSV field if it contains a comma, quote, or newline. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const header = cols.map(csvCell).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(","));
  return [header, ...body].join("\n");
}

/** Flatten changed rows to one CSV row per differing cell. */
function changedToCsv(data: RowDiffResponse): string {
  const header = ["key", "column", "value_a", "value_b"].join(",");
  const body = data.changed.flatMap((row) => {
    const key = Object.values(row.key).join(" / ");
    return Object.entries(row.differences).map(([col, v]) =>
      [csvCell(key), csvCell(col), csvCell(v.a), csvCell(v.b)].join(",")
    );
  });
  return [header, ...body].join("\n");
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/** Export the full row-diff result as a single JSON file. */
export function exportRowDiffJson(data: RowDiffResponse) {
  download(
    `row-diff-${stamp()}.json`,
    JSON.stringify(data, null, 2),
    "application/json"
  );
}

/**
 * Export the row-diff result as CSV. Because the result has three distinct
 * shapes (changed cells, only-in-A, only-in-B), we emit a sectioned CSV.
 */
export function exportRowDiffCsv(data: RowDiffResponse) {
  const parts = [
    "# Changed cells",
    changedToCsv(data),
    "",
    "# Only in A",
    rowsToCsv(data.only_in_a),
    "",
    "# Only in B",
    rowsToCsv(data.only_in_b),
  ];
  download(`row-diff-${stamp()}.csv`, parts.join("\n"), "text/csv");
}
