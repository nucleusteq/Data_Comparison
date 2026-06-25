import type { RowDiffResponse } from "@/lib/api";

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 text-center shadow-sm ${color}`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

function RowTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-sm text-gray-400">None</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            {cols.map((c) => (
              <th key={c} className="py-1 pr-4">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => (
                <td key={c} className="py-1 pr-4 font-mono">{String(r[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RowDiffView({ data }: { data: RowDiffResponse }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        Row comparison{" "}
        <span className="text-sm font-normal text-gray-500">
          (keyed by {data.key_columns.join(", ")})
        </span>
      </h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Matched & equal" value={data.summary.identical_matched} color="border-green-200 bg-green-50 text-green-800" />
        <Stat label="Changed" value={data.summary.changed} color="border-amber-200 bg-amber-50 text-amber-800" />
        <Stat label="Only in A" value={data.summary.only_in_a} color="border-rose-200 bg-rose-50 text-rose-800" />
        <Stat label="Only in B" value={data.summary.only_in_b} color="border-sky-200 bg-sky-50 text-sky-800" />
      </div>

      {data.truncated && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          Results truncated at the row limit. Increase the limit or filter the tables.
        </p>
      )}

      <div className="rounded border border-gray-200 p-3">
        <h4 className="mb-2 font-medium">Changed rows (cell-level)</h4>
        {data.changed.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1 pr-4">Key</th>
                <th className="py-1 pr-4">Column</th>
                <th className="py-1 pr-4">A</th>
                <th className="py-1">B</th>
              </tr>
            </thead>
            <tbody>
              {data.changed.flatMap((row) =>
                Object.entries(row.differences).map(([col, v]) => (
                  <tr key={`${JSON.stringify(row.key)}-${col}`} className="border-b last:border-0">
                    <td className="py-1 pr-4 font-mono">{Object.values(row.key).join(" / ")}</td>
                    <td className="py-1 pr-4">{col}</td>
                    <td className="py-1 pr-4 font-mono text-rose-700">{String(v.a ?? "")}</td>
                    <td className="py-1 font-mono text-emerald-700">{String(v.b ?? "")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">No cell-level changes in matched rows.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 p-3">
          <h4 className="mb-2 font-medium text-rose-700">Only in A ({data.only_in_a.length})</h4>
          <RowTable rows={data.only_in_a} />
        </div>
        <div className="rounded border border-gray-200 p-3">
          <h4 className="mb-2 font-medium text-sky-700">Only in B ({data.only_in_b.length})</h4>
          <RowTable rows={data.only_in_b} />
        </div>
      </div>
    </div>
  );
}
