"use client";

import { useState } from "react";
import { api, SchemaDiffResponse, RowDiffResponse } from "@/lib/api";
import { useLocalStorage } from "@/lib/storage";
import { DataSource } from "@/lib/datasources";
import { DataSourceNav } from "@/components/DataSourceNav";
import { SchemaDiffView } from "@/components/SchemaDiffView";
import { RowDiffView } from "@/components/RowDiffView";

interface CompareState {
  selectedAId: string | null;
  selectedBId: string | null;
  tableA: string;
  tableB: string;
  keyColumns: string;
  schemaResult: SchemaDiffResponse | null;
  rowResult: RowDiffResponse | null;
}

const EMPTY_COMPARE: CompareState = {
  selectedAId: null,
  selectedBId: null,
  tableA: "",
  tableB: "",
  keyColumns: "",
  schemaResult: null,
  rowResult: null,
};

type Tab = "schema" | "rows";

export default function Home() {
  const { value: sources, setValue: setSources } = useLocalStorage<DataSource[]>(
    "comparison-tool-sources",
    []
  );
  const { value: state, setValue: setState } = useLocalStorage<CompareState>(
    "comparison-tool-compare",
    EMPTY_COMPARE
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("schema");

  const update = (patch: Partial<CompareState>) => setState((s) => ({ ...s, ...patch }));

  const sourceById = (id: string | null) => sources.find((d) => d.id === id) ?? null;
  const srcA = sourceById(state.selectedAId);
  const srcB = sourceById(state.selectedBId);

  const pick = (slot: "A" | "B", id: string) =>
    update(slot === "A" ? { selectedAId: id } : { selectedBId: id });

  const run = async (fn: () => Promise<void>, label: string, focus: Tab) => {
    setError(null);
    if (!srcA || !srcB) {
      setError("Select a data source for both A and B in the left panel.");
      return;
    }
    if (!state.tableA.trim()) {
      setError("Enter Table A.");
      return;
    }
    setBusy(label);
    setTab(focus);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const compareSchema = () =>
    run(
      async () => {
        const res = await api.schemaDiff({
          connection_a: srcA!.connectionString,
          connection_b: srcB!.connectionString,
          table_a: state.tableA,
          table_b: state.tableB || state.tableA,
        });
        update({ schemaResult: res });
      },
      "schema",
      "schema"
    );

  const compareRows = () =>
    run(
      async () => {
        const keys = state.keyColumns.split(",").map((s) => s.trim()).filter(Boolean);
        const res = await api.rowDiff({
          connection_a: srcA!.connectionString,
          connection_b: srcB!.connectionString,
          table_a: state.tableA,
          table_b: state.tableB || state.tableA,
          key_columns: keys,
        });
        update({ rowResult: res });
      },
      "rows",
      "rows"
    );

  const compareBoth = async () => {
    await compareSchema();
    await compareRows();
  };

  const hasResults = state.schemaResult || state.rowResult;

  return (
    <div className="flex h-screen overflow-hidden">
      <DataSourceNav
        sources={sources}
        setSources={setSources}
        selectedAId={state.selectedAId}
        selectedBId={state.selectedBId}
        onPick={pick}
      />

      <main className="scroll-thin flex-1 overflow-y-auto">
        {/* Sticky gradient header */}
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-5 text-white shadow">
          <h1 className="text-xl font-bold">Data Source Comparison Tool</h1>
          <p className="text-sm text-indigo-100">
            Compare schema &amp; rows across two databases.
          </p>
        </header>

        <div className="mx-auto max-w-5xl px-8 py-6">
          {/* Setup card */}
          <section className="card mb-6 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Comparison setup
            </h2>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SourceSlot label="Source A" ds={srcA} dot="bg-rose-500" />
              <SourceSlot label="Source B" ds={srcB} dot="bg-emerald-500" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <Field label="Key column(s) (blank = primary key)">
                <input
                  className="input"
                  placeholder="id, region"
                  value={state.keyColumns}
                  onChange={(e) => update({ keyColumns: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button className="btn btn-primary" disabled={!!busy} onClick={compareBoth}>
                {busy ? <Spinner /> : "⚡"} Compare all
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={compareSchema}>
                {busy === "schema" ? <Spinner /> : null} Compare schema
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={compareRows}>
                {busy === "rows" ? <Spinner /> : null} Compare rows
              </button>
              <button
                className="btn btn-ghost ml-auto text-gray-500"
                onClick={() => {
                  setState(() => ({ ...EMPTY_COMPARE }));
                  setError(null);
                }}
              >
                Clear results
              </button>
            </div>
          </section>

          {error && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 animate-fade-in">
              <span>⚠️</span>
              <span className="break-all">{error}</span>
            </div>
          )}

          {/* Results with tabs */}
          {hasResults ? (
            <section className="card overflow-hidden animate-fade-in">
              <div className="flex border-b border-gray-200">
                <TabButton active={tab === "schema"} onClick={() => setTab("schema")} disabled={!state.schemaResult}>
                  Schema diff
                </TabButton>
                <TabButton active={tab === "rows"} onClick={() => setTab("rows")} disabled={!state.rowResult}>
                  Row diff
                </TabButton>
              </div>
              <div className="p-5">
                {tab === "schema" &&
                  (state.schemaResult ? (
                    <SchemaDiffView data={state.schemaResult} />
                  ) : (
                    <Placeholder text='Run "Compare schema" to see schema differences.' />
                  ))}
                {tab === "rows" &&
                  (state.rowResult ? (
                    <RowDiffView data={state.rowResult} />
                  ) : (
                    <Placeholder text='Run "Compare rows" to see row differences.' />
                  ))}
              </div>
            </section>
          ) : (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl">🔍</div>
              <p className="mt-3 max-w-sm text-sm text-gray-500">
                {sources.length < 2
                  ? "Add at least two data sources in the left panel, choose A and B, then run a comparison."
                  : "Pick Source A and Source B, enter a table, and hit Compare."}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SourceSlot({
  label,
  ds,
  dot,
}: {
  label: string;
  ds: DataSource | null;
  dot: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </span>
      </div>
      {ds ? (
        <div className="truncate font-medium text-gray-800" title={ds.name}>
          {ds.name}
        </div>
      ) : (
        <div className="text-sm text-gray-400">← pick in left panel</div>
      )}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative px-5 py-3 text-sm font-medium transition disabled:opacity-40 ${
        active ? "text-indigo-600" : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-indigo-600" />
      )}
    </button>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-gray-400">{text}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}
