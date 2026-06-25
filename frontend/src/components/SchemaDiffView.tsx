import type { SchemaDiffResponse, StructuralDiff } from "@/lib/api";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className={`chip ${color}`}>{children}</span>;
}

/** Render added/removed lists for a structural schema object (indexes, FKs, ...). */
function StructuralSection<T>({
  title,
  diff,
  describe,
}: {
  title: string;
  diff: StructuralDiff<T>;
  describe: (item: T) => string;
}) {
  const total = diff.only_in_a.length + diff.only_in_b.length;
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title} {total ? `(${total} difference${total > 1 ? "s" : ""})` : ""}
      </h4>
      {total ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Only in A
            </div>
            {diff.only_in_a.length ? (
              <ul className="space-y-1">
                {diff.only_in_a.map((it, i) => (
                  <li key={i} className="font-mono text-sm text-gray-800 dark:text-gray-200">
                    {describe(it)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">None</p>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Only in B
            </div>
            {diff.only_in_b.length ? (
              <ul className="space-y-1">
                {diff.only_in_b.map((it, i) => (
                  <li key={i} className="font-mono text-sm text-gray-800 dark:text-gray-200">
                    {describe(it)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">None</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">Identical.</p>
      )}
    </div>
  );
}

export function SchemaDiffView({ data }: { data: SchemaDiffResponse }) {
  const { diff } = data;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Schema comparison</h3>
        {diff.identical ? (
          <Badge color="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">✓ Identical schemas</Badge>
        ) : (
          <Badge color="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Differences found</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
          <h4 className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-400">
            Columns only in A ({diff.columns_only_in_a.length})
          </h4>
          {diff.columns_only_in_a.length ? (
            <div className="flex flex-wrap gap-1.5">
              {diff.columns_only_in_a.map((c) => (
                <span key={c} className="chip bg-rose-100 font-mono text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">None</p>
          )}
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <h4 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Columns only in B ({diff.columns_only_in_b.length})
          </h4>
          {diff.columns_only_in_b.length ? (
            <div className="flex flex-wrap gap-1.5">
              {diff.columns_only_in_b.map((c) => (
                <span key={c} className="chip bg-emerald-100 font-mono text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">None</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Changed columns ({diff.columns_changed.length})
        </h4>
        {diff.columns_changed.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-700 dark:text-gray-500">
                  <th className="py-1.5 pr-4">Column</th>
                  <th className="py-1.5 pr-4">Attribute</th>
                  <th className="py-1.5 pr-4">A</th>
                  <th className="py-1.5">B</th>
                </tr>
              </thead>
              <tbody>
                {diff.columns_changed.flatMap((c) =>
                  Object.entries(c.differences).map(([attr, v]) => (
                    <tr key={`${c.column}-${attr}`} className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
                      <td className="py-1.5 pr-4 font-mono text-gray-800 dark:text-gray-200">{c.column}</td>
                      <td className="py-1.5 pr-4 text-gray-700 dark:text-gray-300">{attr}</td>
                      <td className="py-1.5 pr-4 font-mono text-rose-700 dark:text-rose-400">{String(v.a)}</td>
                      <td className="py-1.5 font-mono text-emerald-700 dark:text-emerald-400">{String(v.b)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">No type/nullable/default changes.</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700 dark:text-gray-300">
        <span className="font-medium text-gray-700 dark:text-gray-300">Primary key: </span>
        <span className="font-mono">[{diff.primary_key.a.join(", ")}]</span> vs{" "}
        <span className="font-mono">[{diff.primary_key.b.join(", ")}]</span>{" "}
        {diff.primary_key.match ? (
          <Badge color="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">match</Badge>
        ) : (
          <Badge color="bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">differ</Badge>
        )}
      </div>

      <StructuralSection
        title="Indexes"
        diff={diff.indexes}
        describe={(ix) =>
          `${ix.unique ? "UNIQUE " : ""}(${ix.columns.join(", ")})${
            ix.name ? ` — ${ix.name}` : ""
          }`
        }
      />
      <StructuralSection
        title="Foreign keys"
        diff={diff.foreign_keys}
        describe={(fk) =>
          `(${fk.columns.join(", ")}) → ${fk.referred_table ?? "?"}(${fk.referred_columns.join(", ")})`
        }
      />
      <StructuralSection
        title="Unique constraints"
        diff={diff.unique_constraints}
        describe={(uc) => `(${uc.columns.join(", ")})${uc.name ? ` — ${uc.name}` : ""}`}
      />
      <StructuralSection
        title="Check constraints"
        diff={diff.check_constraints}
        describe={(cc) => cc.sqltext || cc.name || "(check)"}
      />
    </div>
  );
}
