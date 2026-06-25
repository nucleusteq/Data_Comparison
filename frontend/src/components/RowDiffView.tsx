import type { RowDiffResponse } from "@/lib/api";
import { exportRowDiffCsv, exportRowDiffJson } from "@/lib/export";

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 text-center shadow-sm ${color}`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

const DISPLAY_LIMIT = 200;

function RowTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-sm text-gray-400 dark:text-gray-500">None</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {cols.map((c) => (
              <th key={c} className="py-1 pr-4">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, DISPLAY_LIMIT).map((r, i) => (
            <tr key={i} className="border-b last:border-0 dark:border-gray-700">
              {cols.map((c) => (
                <td key={c} className="py-1 pr-4 font-mono text-gray-800 dark:text-gray-200">
                  {String(r[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > DISPLAY_LIMIT && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Showing first {DISPLAY_LIMIT} of {rows.length} rows. Export to see all.
        </p>
      )}
    </div>
  );
}

export function RowDiffView({ data }: { data: RowDiffResponse }) {
  const hasData =
    data.changed.length > 0 ||
    data.only_in_a.length > 0 ||
    data.only_in_b.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Row comparison{" "}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            (keyed by {data.key_columns.join(", ")})
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost !py-1.5 text-xs"
            disabled={!hasData}
            onClick={() => exportRowDiffCsv(data)}
            title="Download differences as CSV"
          >
            ⬇ CSV
          </button>
          <button
            className="btn btn-ghost !py-1.5 text-xs"
            onClick={() => exportRowDiffJson(data)}
            title="Download full result as JSON"
          >
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
        <p
          key={i}
          className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          ⚠ {w}
        </p>
      ))}

      <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
        <h4 className="mb-2 font-medium text-gray-800 dark:text-gray-200">Changed rows (cell-level)</h4>
        {data.changed.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="py-1 pr-4">Key</th>
                <th className="py-1 pr-4">Column</th>
                <th className="py-1 pr-4">A</th>
                <th className="py-1">B</th>
              </tr>
            </thead>
            <tbody>
              {data.changed.flatMap((row) =>
                Object.entries(row.differences).map(([col, v]) => (
                  <tr key={`${JSON.stringify(row.key)}-${col}`} className="border-b last:border-0 dark:border-gray-700">
                    <td className="py-1 pr-4 font-mono text-gray-700 dark:text-gray-300">{Object.values(row.key).join(" / ")}</td>
                    <td className="py-1 pr-4 text-gray-700 dark:text-gray-300">{col}</td>
                    <td className="py-1 pr-4 font-mono text-rose-700 dark:text-rose-400">{String(v.a ?? "")}</td>
                    <td className="py-1 font-mono text-emerald-700 dark:text-emerald-400">{String(v.b ?? "")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">No cell-level changes in matched rows.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
          <h4 className="mb-2 font-medium text-rose-700 dark:text-rose-400">Only in A ({data.only_in_a.length})</h4>
          <RowTable rows={data.only_in_a} />
        </div>
        <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
          <h4 className="mb-2 font-medium text-sky-700 dark:text-sky-400">Only in B ({data.only_in_b.length})</h4>
          <RowTable rows={data.only_in_b} />
        </div>
      </div>
    </div>
  );
}
