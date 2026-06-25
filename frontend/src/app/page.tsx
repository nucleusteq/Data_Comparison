"use client";

import { useState } from "react";
import { api, SchemaDiffResponse, RowDiffResponse } from "@/lib/api";
import { useLocalStorage } from "@/lib/storage";
import { SchemaDiffView } from "@/components/SchemaDiffView";
import { RowDiffView } from "@/components/RowDiffView";

interface Persisted {
  connA: string;
  connB: string;
  tableA: string;
  tableB: string;
  keyColumns: string;
  schemaResult: SchemaDiffResponse | null;
  rowResult: RowDiffResponse | null;
}

const EMPTY: Persisted = {
  connA: "",
  connB: "",
  tableA: "",
  tableB: "",
  keyColumns: "",
  schemaResult: null,
  rowResult: null,
};

export default function Home() {
  const { value: state, setValue: setState, clear } = useLocalStorage<Persisted>(
    "comparison-tool-state",
    EMPTY
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = (patch: Partial<Persisted>) => setState((s) => ({ ...s, ...patch }));

  const run = async (fn: () => Promise<void>, label: string) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const compareSchema = () =>
    run(async () => {
      const res = await api.schemaDiff({
        connection_a: state.connA,
        connection_b: state.connB,
        table_a: state.tableA,
        table_b: state.tableB || state.tableA,
      });
      update({ schemaResult: res });
    }, "schema");

  const compareRows = () =>
    run(async () => {
      const keys = state.keyColumns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.rowDiff({
        connection_a: state.connA,
        connection_b: state.connB,
        table_a: state.tableA,
        table_b: state.tableB || state.tableA,
        key_columns: keys,
      });
      update({ rowResult: res });
    }, "rows");

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Data Source Comparison Tool</h1>
        <p className="text-sm text-gray-500">
          Compare two database tables — schema and rows. All inputs and results
          are saved in your browser&apos;s localStorage; nothing is stored on the server.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Source A connection string">
          <input
            className="input"
            placeholder="postgresql+psycopg2://user:pass@host:5432/db"
            value={state.connA}
            onChange={(e) => update({ connA: e.target.value })}
          />
        </Field>
        <Field label="Source B connection string">
          <input
            className="input"
            placeholder="mysql+pymysql://user:pass@host:3306/db"
            value={state.connB}
            onChange={(e) => update({ connB: e.target.value })}
          />
        </Field>
        <Field label="Table A">
          <input
            className="input"
            placeholder="customers"
            value={state.tableA}
            onChange={(e) => update({ tableA: e.target.value })}
          />
        </Field>
        <Field label="Table B (blank = same as A)">
          <input
            className="input"
            placeholder="customers"
            value={state.tableB}
            onChange={(e) => update({ tableB: e.target.value })}
          />
        </Field>
        <Field label="Key column(s), comma-separated (blank = primary key of A)">
          <input
            className="input"
            placeholder="id"
            value={state.keyColumns}
            onChange={(e) => update({ keyColumns: e.target.value })}
          />
        </Field>
      </section>

      <div className="mb-6 flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={!!busy} onClick={compareSchema}>
          {busy === "schema" ? "Comparing…" : "Compare schemas"}
        </button>
        <button className="btn btn-primary" disabled={!!busy} onClick={compareRows}>
          {busy === "rows" ? "Comparing…" : "Compare rows"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            clear();
            setError(null);
          }}
        >
          Clear saved data
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {state.schemaResult && <SchemaDiffView data={state.schemaResult} />}
        {state.rowResult && <RowDiffView data={state.rowResult} />}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
