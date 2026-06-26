"use client";

import { useMemo, useState } from "react";
import type { Sheet } from "@/lib/export";

const PAGE = 200;

type SortDir = "asc" | "desc" | null;

/**
 * A filterable, sortable table over a {@link Sheet}. Used for every diff
 * section so search / sort / density behave identically everywhere.
 */
export function DataTable({
  sheet,
  filter,
  dense,
  emptyText = "None",
}: {
  sheet: Sheet;
  filter: string;
  dense: boolean;
  emptyText?: string;
}) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [shown, setShown] = useState(PAGE);

  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let rows = sheet.rows;
    if (q) rows = rows.filter((r) => r.some((c) => cell(c).toLowerCase().includes(q)));
    if (sortCol !== null && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = cell(a[sortCol]);
        const bv = cell(b[sortCol]);
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [sheet.rows, filter, sortCol, sortDir]);

  const toggleSort = (i: number) => {
    if (sortCol !== i) {
      setSortCol(i);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol(null);
      setSortDir(null);
    }
  };

  if (!sheet.columns.length) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">{emptyText}</p>;
  }

  const pad = dense ? "py-0.5 pr-3" : "py-1.5 pr-4";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {sheet.columns.map((c, i) => (
              <th
                key={c}
                className={`${pad} cursor-pointer select-none whitespace-nowrap hover:text-gray-800 dark:hover:text-gray-200`}
                onClick={() => toggleSort(i)}
                title="Click to sort"
              >
                {c}
                {sortCol === i ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, shown).map((r, i) => (
            <tr key={i} className="border-b last:border-0 dark:border-gray-700">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`${pad} font-mono text-gray-800 dark:text-gray-200`}
                >
                  {cell(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          No rows match “{filter}”.
        </p>
      )}

      {filtered.length > shown && (
        <button
          className="btn btn-ghost mt-2 !py-1 text-xs"
          onClick={() => setShown((s) => s + PAGE)}
        >
          Show {Math.min(PAGE, filtered.length - shown)} more
          (showing {shown} of {filtered.length})
        </button>
      )}
    </div>
  );
}
