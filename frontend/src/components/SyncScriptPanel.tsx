"use client";

import { useState } from "react";
import { api, RowDiffResponse } from "@/lib/api";

interface Props {
  data: RowDiffResponse;
  /** Default target table (the B-side table name). */
  targetTable: string;
}

/**
 * Generates SQL (INSERT/UPDATE/DELETE) to make target B match source A,
 * using the current row-diff result. The script is not run — it's for review.
 */
export function SyncScriptPanel({ data, targetTable }: Props) {
  const [sql, setSql] = useState<string | null>(null);
  const [target, setTarget] = useState(targetTable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const total =
    data.summary.only_in_a + data.summary.only_in_b + data.summary.changed;

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.syncSql({ row_diff: data, target_table: target.trim() });
      setSql(res.sql);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadSql = () => {
    if (!sql) return;
    const blob = new Blob([sql], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sync-${target.trim() || "table"}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Target table (B) to update
          </span>
          <input
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="customers"
          />
        </label>
        <button className="btn btn-primary" onClick={generate} disabled={busy || !target.trim()}>
          {busy ? "Generating…" : "Generate sync SQL"}
        </button>
        {sql && (
          <>
            <button className="btn btn-ghost" onClick={copy}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button className="btn btn-ghost" onClick={downloadSql}>
              ⬇ .sql
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Makes <span className="font-mono">{target || "B"}</span> match source A —{" "}
        {data.summary.only_in_a} INSERT, {data.summary.changed} UPDATE,{" "}
        {data.summary.only_in_b} DELETE ({total} statements). Review before running;
        the tool never executes it.
      </p>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {sql && (
        <pre className="scroll-thin max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs leading-relaxed text-gray-100">
          {sql}
        </pre>
      )}
    </div>
  );
}
