"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DataSource } from "@/lib/datasources";

interface Props {
  srcA: DataSource | null;
  srcB: DataSource | null;
  tableA: string;
  tableB: string;
  keyColumns: string;
  ignoreColumns: string;
  columnMap: Record<string, string>;
  whereA: string;
  whereB: string;
  onChange: (patch: {
    tableA?: string;
    tableB?: string;
    keyColumns?: string;
    ignoreColumns?: string;
    columnMap?: Record<string, string>;
    whereA?: string;
    whereB?: string;
  }) => void;
}

/** Load a table's column names for a connection. */
function useColumns(src: DataSource | null, table: string) {
  const [columns, setColumns] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!src || !table) {
        setColumns([]);
        return;
      }
      try {
        const res = await api.columns(src.connectionString, table);
        if (!cancelled) setColumns(res.columns);
      } catch {
        if (!cancelled) setColumns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, table]);
  return columns;
}

/** Load table names for a connection; returns loading/error state. */
function useTables(src: DataSource | null) {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!src) {
        setTables([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { tables } = await api.tables(src.connectionString);
        if (!cancelled) setTables(tables);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { tables, loading, error };
}

/** Dropdown of tables with a free-text fallback for names not in the list. */
function TablePicker({
  label,
  src,
  value,
  onChange,
}: {
  label: string;
  src: DataSource | null;
  value: string;
  onChange: (v: string) => void;
}) {
  const { tables, loading, error } = useTables(src);
  const known = tables.includes(value);

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {loading && <span className="ml-2 text-xs text-gray-400">loading…</span>}
      </span>
      {!src ? (
        <input className="input" disabled placeholder="Select a source first" />
      ) : error ? (
        <input
          className="input"
          placeholder="Type a table name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <select
          className="input"
          value={known ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— choose a table —</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {error && (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
          Couldn’t list tables: {error}
        </span>
      )}
    </label>
  );
}

/** Checkboxes for the columns of table A, used as row-match keys. */
function KeyColumnPicker({
  src,
  table,
  value,
  onChange,
}: {
  src: DataSource | null;
  table: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [columns, setColumns] = useState<string[]>([]);
  const [pk, setPk] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!src || !table) {
        setColumns([]);
        setPk([]);
        return;
      }
      setLoading(true);
      try {
        const res = await api.columns(src.connectionString, table);
        if (!cancelled) {
          setColumns(res.columns);
          setPk(res.primary_key);
        }
      } catch {
        if (!cancelled) {
          setColumns([]);
          setPk([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, table]);

  const selected = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const toggle = (col: string) => {
    const next = selected.includes(col)
      ? selected.filter((c) => c !== col)
      : [...selected, col];
    onChange(next.join(", "));
  };

  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Key column(s){" "}
        <span className="font-normal text-gray-400">
          (blank = primary key of A
          {pk.length ? `: ${pk.join(", ")}` : ""})
        </span>
        {loading && <span className="ml-2 text-xs text-gray-400">loading…</span>}
      </span>
      {columns.length ? (
        <div className="flex flex-wrap gap-1.5">
          {columns.map((col) => {
            const on = selected.includes(col);
            return (
              <button
                key={col}
                type="button"
                onClick={() => toggle(col)}
                className={`chip font-mono transition ${
                  on
                    ? "bg-indigo-600 text-white"
                    : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {on ? "✓ " : ""}
                {col}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          className="input"
          placeholder="id"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** Chips to pick a subset of A's columns (used for "ignore these columns"). */
function ColumnChips({
  columns,
  value,
  onChange,
  activeClass = "bg-amber-500 text-white",
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  activeClass?: string;
}) {
  const selected = value.split(",").map((s) => s.trim()).filter(Boolean);
  const toggle = (col: string) => {
    const next = selected.includes(col)
      ? selected.filter((c) => c !== col)
      : [...selected, col];
    onChange(next.join(", "));
  };
  if (!columns.length) {
    return (
      <input
        className="input"
        placeholder="comma-separated column names"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {columns.map((col) => {
        const on = selected.includes(col);
        return (
          <button
            key={col}
            type="button"
            onClick={() => toggle(col)}
            className={`chip font-mono transition ${
              on
                ? activeClass
                : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {on ? "✓ " : ""}
            {col}
          </button>
        );
      })}
    </div>
  );
}

/** Map A columns to differently-named B columns. */
function ColumnMapEditor({
  colsA,
  colsB,
  value,
  onChange,
}: {
  colsA: string[];
  colsB: string[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const entries = Object.entries(value);
  const setEntry = (aCol: string, bCol: string) => {
    const next = { ...value };
    if (bCol) next[aCol] = bCol;
    else delete next[aCol];
    onChange(next);
  };

  if (!colsA.length) {
    return (
      <p className="text-xs text-gray-400">
        Pick Source A and Table A to map columns.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {colsA.map((aCol) => {
        const mapped = value[aCol] ?? "";
        return (
          <div key={aCol} className="flex items-center gap-2 text-sm">
            <span className="w-1/3 truncate font-mono text-gray-700 dark:text-gray-300" title={aCol}>
              {aCol}
            </span>
            <span className="text-gray-400">→</span>
            <select
              className="input !py-1 flex-1"
              value={colsB.includes(mapped) ? mapped : ""}
              onChange={(e) => setEntry(aCol, e.target.value)}
            >
              <option value="">(same name)</option>
              {colsB.map((bCol) => (
                <option key={bCol} value={bCol}>
                  {bCol}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {entries.length > 0 && (
        <p className="pt-1 text-xs text-gray-500 dark:text-gray-400">
          {entries.length} column(s) remapped.
        </p>
      )}
    </div>
  );
}

function AdvancedOptions(props: Props) {
  const { srcA, srcB, tableA, tableB, onChange } = props;
  // Persisted state from older versions may lack these fields, so default them.
  const ignoreColumns = props.ignoreColumns ?? "";
  const columnMap = props.columnMap ?? {};
  const whereA = props.whereA ?? "";
  const whereB = props.whereB ?? "";
  const [open, setOpen] = useState(
    !!(ignoreColumns || Object.keys(columnMap).length || whereA || whereB)
  );
  const colsA = useColumns(srcA, tableA);
  const colsB = useColumns(srcB, tableB || tableA);

  const activeCount =
    (ignoreColumns ? 1 : 0) +
    (Object.keys(columnMap).length ? 1 : 0) +
    (whereA ? 1 : 0) +
    (whereB ? 1 : 0);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        <span>
          Advanced options
          {activeCount > 0 && (
            <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              {activeCount} active
            </span>
          )}
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-200 p-3 dark:border-gray-700">
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Ignore columns{" "}
              <span className="font-normal text-gray-400">(skip during comparison)</span>
            </span>
            <ColumnChips
              columns={colsA}
              value={ignoreColumns}
              onChange={(v) => onChange({ ignoreColumns: v })}
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Column mapping{" "}
              <span className="font-normal text-gray-400">(A column → B column, for renames)</span>
            </span>
            <ColumnMapEditor
              colsA={colsA}
              colsB={colsB}
              value={columnMap}
              onChange={(v) => onChange({ columnMap: v })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter A <span className="font-normal text-gray-400">(SQL WHERE)</span>
              </span>
              <input
                className="input font-mono"
                placeholder="status = 'active'"
                value={whereA}
                onChange={(e) => onChange({ whereA: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter B <span className="font-normal text-gray-400">(SQL WHERE)</span>
              </span>
              <input
                className="input font-mono"
                placeholder="status = 'active'"
                value={whereB}
                onChange={(e) => onChange({ whereB: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export function CompareInputs(props: Props) {
  const { srcA, srcB, tableA, tableB, keyColumns, onChange } = props;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TablePicker
          label="Table A"
          src={srcA}
          value={tableA}
          onChange={(v) => onChange({ tableA: v })}
        />
        <TablePicker
          label="Table B (blank = same as A)"
          src={srcB}
          value={tableB}
          onChange={(v) => onChange({ tableB: v })}
        />
      </div>
      <KeyColumnPicker
        src={srcA}
        table={tableA}
        value={keyColumns}
        onChange={(v) => onChange({ keyColumns: v })}
      />
      <AdvancedOptions {...props} />
    </div>
  );
}
