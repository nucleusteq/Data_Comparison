import type { SchemaDiffResponse } from "@/lib/api";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className={`chip ${color}`}>{children}</span>;
}

export function SchemaDiffView({ data }: { data: SchemaDiffResponse }) {
  const { diff } = data;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-800">Schema comparison</h3>
        {diff.identical ? (
          <Badge color="bg-green-100 text-green-800">✓ Identical schemas</Badge>
        ) : (
          <Badge color="bg-amber-100 text-amber-800">Differences found</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
          <h4 className="mb-2 text-sm font-semibold text-rose-700">
            Columns only in A ({diff.columns_only_in_a.length})
          </h4>
          {diff.columns_only_in_a.length ? (
            <div className="flex flex-wrap gap-1.5">
              {diff.columns_only_in_a.map((c) => (
                <span key={c} className="chip bg-rose-100 font-mono text-rose-800">
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">None</p>
          )}
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
          <h4 className="mb-2 text-sm font-semibold text-emerald-700">
            Columns only in B ({diff.columns_only_in_b.length})
          </h4>
          {diff.columns_only_in_b.length ? (
            <div className="flex flex-wrap gap-1.5">
              {diff.columns_only_in_b.map((c) => (
                <span key={c} className="chip bg-emerald-100 font-mono text-emerald-800">
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">None</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <h4 className="mb-2 text-sm font-semibold text-gray-700">
          Changed columns ({diff.columns_changed.length})
        </h4>
        {diff.columns_changed.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-4">Column</th>
                  <th className="py-1.5 pr-4">Attribute</th>
                  <th className="py-1.5 pr-4">A</th>
                  <th className="py-1.5">B</th>
                </tr>
              </thead>
              <tbody>
                {diff.columns_changed.flatMap((c) =>
                  Object.entries(c.differences).map(([attr, v]) => (
                    <tr key={`${c.column}-${attr}`} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-1.5 pr-4 font-mono">{c.column}</td>
                      <td className="py-1.5 pr-4">{attr}</td>
                      <td className="py-1.5 pr-4 font-mono text-rose-700">{String(v.a)}</td>
                      <td className="py-1.5 font-mono text-emerald-700">{String(v.b)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No type/nullable/default changes.</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-3 text-sm">
        <span className="font-medium text-gray-700">Primary key: </span>
        <span className="font-mono">[{diff.primary_key.a.join(", ")}]</span> vs{" "}
        <span className="font-mono">[{diff.primary_key.b.join(", ")}]</span>{" "}
        {diff.primary_key.match ? (
          <Badge color="bg-green-100 text-green-800">match</Badge>
        ) : (
          <Badge color="bg-rose-100 text-rose-800">differ</Badge>
        )}
      </div>
    </div>
  );
}
