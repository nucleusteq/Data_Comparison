import type { SchemaDiffResponse } from "@/lib/api";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {children}
    </span>
  );
}

export function SchemaDiffView({ data }: { data: SchemaDiffResponse }) {
  const { diff } = data;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">Schema comparison</h3>
        {diff.identical ? (
          <Badge color="bg-green-100 text-green-800">Identical schemas</Badge>
        ) : (
          <Badge color="bg-amber-100 text-amber-800">Differences found</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 p-3">
          <h4 className="mb-2 font-medium text-rose-700">Columns only in A</h4>
          {diff.columns_only_in_a.length ? (
            <ul className="list-inside list-disc text-sm">
              {diff.columns_only_in_a.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">None</p>
          )}
        </div>
        <div className="rounded border border-gray-200 p-3">
          <h4 className="mb-2 font-medium text-emerald-700">Columns only in B</h4>
          {diff.columns_only_in_b.length ? (
            <ul className="list-inside list-disc text-sm">
              {diff.columns_only_in_b.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">None</p>
          )}
        </div>
      </div>

      <div className="rounded border border-gray-200 p-3">
        <h4 className="mb-2 font-medium">Changed columns</h4>
        {diff.columns_changed.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1 pr-4">Column</th>
                <th className="py-1 pr-4">Attribute</th>
                <th className="py-1 pr-4">A</th>
                <th className="py-1">B</th>
              </tr>
            </thead>
            <tbody>
              {diff.columns_changed.flatMap((c) =>
                Object.entries(c.differences).map(([attr, v]) => (
                  <tr key={`${c.column}-${attr}`} className="border-b last:border-0">
                    <td className="py-1 pr-4 font-mono">{c.column}</td>
                    <td className="py-1 pr-4">{attr}</td>
                    <td className="py-1 pr-4 font-mono text-rose-700">{String(v.a)}</td>
                    <td className="py-1 font-mono text-emerald-700">{String(v.b)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">No type/nullable/default changes.</p>
        )}
      </div>

      <div className="rounded border border-gray-200 p-3 text-sm">
        <span className="font-medium">Primary key: </span>
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
