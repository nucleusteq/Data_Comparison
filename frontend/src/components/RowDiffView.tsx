"use client";

import { useMemo, useState } from "react";
import type { RowDiffResponse } from "@/lib/api";
import {
  Sheet,
  exportRowDiffCsv,
  exportRowDiffExcel,
  exportRowDiffJson,
  rowDiffSheets,
} from "@/lib/export";
import { DataTable } from "@/components/diff/DataTable";
import { SectionActions } from "@/components/diff/SectionActions";

type ViewMode = "unified" | "sideBySide" | "summary";

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 text-center shadow-sm ${color}`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

/** Changed rows flattened to one row per differing cell (unified view). */
function unifiedChangedSheet(data: RowDiffResponse): Sheet {
  return {
    name: "Changed cells",
    columns: ["key", "column", "A", "B"],
    rows: data.changed.flatMap((row) => {
      const key = Object.values(row.key).join(" / ");
      return Object.entries(row.differences).map(([col, v]) => [key, col, v.a, v.b]);
    }),
  };
}

/** Changed rows as one row per record, with paired A|B columns (side-by-side). */
function sideBySideChangedSheet(data: RowDiffResponse): Sheet {
  const changedCols = Array.from(
    new Set(data.changed.flatMap((r) => Object.keys(r.differences)))
  );
  const columns = ["key", ...changedCols.flatMap((c) => [`${c} (A)`, `${c} (B)`])];
  const rows = data.changed.map((row) => {
    const key = Object.values(row.key).join(" / ");
    const out: unknown[] = [key];
    for (const c of changedCols) {
      const diff = row.differences[c];
      out.push(diff ? diff.a : "", diff ? diff.b : "");
    }
    return out;
  });
  return { name: "Changed (side-by-side)", columns, rows };
}

export function RowDiffView({ data }: { data: RowDiffResponse }) {
  const [view, setView] = useState<ViewMode>("unified");
  const [filter, setFilter] = useState("");
  const [dense, setDense] = useState(false);

  const hasData =
    data.changed.length > 0 ||
    data.only_in_a.length > 0 ||
    data.only_in_b.length > 0;

  const [, onlyASheet, onlyBSheet] = rowDiffSheets(data);
  const changedSheet = useMemo(
    () => (view === "sideBySide" ? sideBySideChangedSheet(data) : unifiedChangedSheet(data)),
    [data, view]
  );

  return (
    <div className="space-y-4">
      {/* Header + global exports */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Row comparison{" "}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            (keyed by {data.key_columns.join(", ")})
          </span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost !py-1.5 text-xs" disabled={!hasData} onClick={() => exportRowDiffExcel(data)} title="Download all sections as a multi-sheet Excel file">
            ⬇ Excel
          </button>
          <button className="btn btn-ghost !py-1.5 text-xs" disabled={!hasData} onClick={() => exportRowDiffCsv(data)} title="Download all sections as one CSV">
            ⬇ CSV
          </button>
          <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => exportRowDiffJson(data)} title="Download full result as JSON">
            ⬇ JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Matched & equal" value={data.summary.identical_matched} color="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300" />
        <Stat label="Changed" value={data.summary.changed} color="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" />
        <Stat label="Only in A" value={data.summary.only_in_a} color="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" />
        <Stat label="Only in B" value={data.summary.only_in_b} color="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300" />
      </div>

      {data.truncated && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Results truncated at the row limit. Increase the limit or filter the tables.
        </p>
      )}
      {data.warnings?.map((w, i) => (
        <p key={i} className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          ⚠ {w}
        </p>
      ))}

      {/* View + display controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex gap-1">
          {([
            ["unified", "Unified"],
            ["sideBySide", "Side-by-side"],
            ["summary", "Summary"],
          ] as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`chip transition ${
                view === mode
                  ? "bg-indigo-600 text-white"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view !== "summary" && (
          <>
            <input
              className="input !w-auto flex-1 !py-1 text-xs"
              placeholder="Filter rows…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={dense} onChange={(e) => setDense(e.target.checked)} />
              Compact
            </label>
          </>
        )}
      </div>

      {view === "summary" ? (
        <p className="rounded border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          {data.matched} matched ({data.summary.identical_matched} identical,{" "}
          {data.summary.changed} changed), {data.summary.only_in_a} only in A,{" "}
          {data.summary.only_in_b} only in B. Row counts — A: {data.row_counts.a}, B: {data.row_counts.b}.
        </p>
      ) : (
        <>
          <Section title="Changed rows" sheet={changedSheet} filter={filter} dense={dense} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Section title={`Only in A (${data.only_in_a.length})`} sheet={onlyASheet} filter={filter} dense={dense} accent="text-rose-700 dark:text-rose-400" />
            <Section title={`Only in B (${data.only_in_b.length})`} sheet={onlyBSheet} filter={filter} dense={dense} accent="text-sky-700 dark:text-sky-400" />
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  sheet,
  filter,
  dense,
  accent = "text-gray-800 dark:text-gray-200",
}: {
  title: string;
  sheet: Sheet;
  filter: string;
  dense: boolean;
  accent?: string;
}) {
  return (
    <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className={`font-medium ${accent}`}>{title}</h4>
        <SectionActions sheet={sheet} />
      </div>
      <DataTable sheet={sheet} filter={filter} dense={dense} />
    </div>
  );
}
