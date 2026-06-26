"use client";

import { useState } from "react";
import {
  Sheet,
  copySheetCsv,
  copySheetMarkdown,
  exportSheetCsv,
} from "@/lib/export";

/** Compact CSV-download + copy buttons for one diff section. */
export function SectionActions({ sheet }: { sheet: Sheet }) {
  const [copied, setCopied] = useState<string | null>(null);
  const disabled = sheet.rows.length === 0;

  const flash = (label: string) => {
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        className="btn btn-ghost !px-2 !py-1 text-xs"
        disabled={disabled}
        onClick={() => exportSheetCsv(sheet)}
        title="Download this section as CSV"
      >
        ⬇ CSV
      </button>
      <button
        className="btn btn-ghost !px-2 !py-1 text-xs"
        disabled={disabled}
        onClick={async () => (await copySheetCsv(sheet)) && flash("csv")}
        title="Copy this section as CSV"
      >
        {copied === "csv" ? "✓" : "⧉"} CSV
      </button>
      <button
        className="btn btn-ghost !px-2 !py-1 text-xs"
        disabled={disabled}
        onClick={async () => (await copySheetMarkdown(sheet)) && flash("md")}
        title="Copy this section as a markdown table"
      >
        {copied === "md" ? "✓" : "⧉"} MD
      </button>
    </div>
  );
}
