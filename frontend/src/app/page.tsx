"use client";

import { useState } from "react";
import { api, SchemaDiffResponse, RowDiffResponse, QuickCountResponse } from "@/lib/api";
import { useLocalStorage } from "@/lib/storage";
import { DataSource } from "@/lib/datasources";
import { DataSourceNav } from "@/components/DataSourceNav";
import { CompareInputs } from "@/components/CompareInputs";
import { SchemaDiffView } from "@/components/SchemaDiffView";
import { RowDiffView } from "@/components/RowDiffView";
import { SyncScriptPanel } from "@/components/SyncScriptPanel";

interface CompareState {
  selectedAId: string | null;
  selectedBId: string | null;
  tableA: string;
  tableB: string;
  keyColumns: string;
  ignoreColumns: string;
  columnMap: Record<string, string>;
  whereA: string;
  whereB: string;
  schemaResult: SchemaDiffResponse | null;
  rowResult: RowDiffResponse | null;
}

const EMPTY_COMPARE: CompareState = {
  selectedAId: null,
  selectedBId: null,
  tableA: "",
  tableB: "",
  keyColumns: "",
  ignoreColumns: "",
  columnMap: {},
  whereA: "",
  whereB: "",
  schemaResult: null,
  rowResult: null,
};

type Tab = "schema" | "rows" | "sync";

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
  const [countResult, setCountResult] = useState<QuickCountResponse | null>(null);

  const update = (patch: Partial<CompareState>) => setState((s) => ({ ...s, ...patch }));

  const sourceById = (id: string | null) => sources.find((d) => d.id === id) ?? null;
  const srcA = sourceById(state.selectedAId);
  const srcB = sourceById(state.selectedBId);

  const pick = (slot: "A" | "B", id: string) =>
    update(slot === "A" ? { selectedAId: id } : { selectedBId: id });

  const run = async (fn: () => Promise<void>, label: string, focus?: Tab) => {
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
    if (focus) setTab(focus);
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
        const ignore = state.ignoreColumns.split(",").map((s) => s.trim()).filter(Boolean);
        // Drop empty mappings so the backend only sees real renames.
        const columnMap = Object.fromEntries(
          Object.entries(state.columnMap).filter(([a, b]) => a && b)
        );
        const res = await api.rowDiff({
          connection_a: srcA!.connectionString,
          connection_b: srcB!.connectionString,
          table_a: state.tableA,
          table_b: state.tableB || state.tableA,
          key_columns: keys,
          ignore_columns: ignore,
          column_map: columnMap,
          where_a: state.whereA.trim() || null,
          where_b: state.whereB.trim() || null,
        });
        update({ rowResult: res });
      },
      "rows",
      "rows"
    );

  const quickCount = () =>
    run(async () => {
      const res = await api.quickCount({
        connection_a: srcA!.connectionString,
        connection_b: srcB!.connectionString,
        table_a: state.tableA,
        table_b: state.tableB || state.tableA,
        where_a: state.whereA.trim() || null,
        where_b: state.whereB.trim() || null,
      });
      setCountResult(res);
    }, "count");

  const compareBoth = async () => {
    setCountResult(null);
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
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Comparison setup
            </h2>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SourceSlot label="Source A" ds={srcA} dot="bg-rose-500" />
              <SourceSlot label="Source B" ds={srcB} dot="bg-emerald-500" />
            </div>

            <CompareInputs
              srcA={srcA}
              srcB={srcB}
              tableA={state.tableA}
              tableB={state.tableB}
              keyColumns={state.keyColumns}
              ignoreColumns={state.ignoreColumns}
              columnMap={state.columnMap}
              whereA={state.whereA}
              whereB={state.whereB}
              onChange={update}
            />

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
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={quickCount}
                title="Cheap row-count-only check — no rows loaded into memory"
              >
                {busy === "count" ? <Spinner /> : null} Quick count
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
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 animate-fade-in dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <span>⚠️</span>
              <span className="break-all">{error}</span>
            </div>
          )}

          {countResult && (
            <div
              className={`mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border p-3 text-sm animate-fade-in ${
                countResult.counts_match
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              <span className="font-medium">
                {countResult.counts_match ? "✓ Row counts match" : "Row counts differ"}
              </span>
              <span className="font-mono">A: {countResult.row_counts.a.toLocaleString()}</span>
              <span className="font-mono">B: {countResult.row_counts.b.toLocaleString()}</span>
              {!countResult.counts_match && (
                <span className="font-mono">
                  Δ {countResult.delta > 0 ? "+" : ""}
                  {countResult.delta.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Results with tabs */}
          {hasResults ? (
            <section className="card overflow-hidden animate-fade-in">
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <TabButton active={tab === "schema"} onClick={() => setTab("schema")} disabled={!state.schemaResult}>
                  Schema diff
                </TabButton>
                <TabButton active={tab === "rows"} onClick={() => setTab("rows")} disabled={!state.rowResult}>
                  Row diff
                </TabButton>
                <TabButton active={tab === "sync"} onClick={() => setTab("sync")} disabled={!state.rowResult}>
                  Sync script
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
                {tab === "sync" &&
                  (state.rowResult ? (
                    <SyncScriptPanel
                      data={state.rowResult}
                      targetTable={state.tableB || state.tableA}
                    />
                  ) : (
                    <Placeholder text='Run "Compare rows" first, then generate a sync script.' />
                  ))}
              </div>
            </section>
          ) : (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl">🔍</div>
              <p className="mt-3 max-w-sm text-sm text-gray-500 dark:text-gray-400">
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
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
      </div>
      {ds ? (
        <div className="truncate font-medium text-gray-800 dark:text-gray-100" title={ds.name}>
          {ds.name}
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-gray-500">← pick in left panel</div>
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
        active
          ? "text-indigo-600 dark:text-indigo-400"
          : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
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
  return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">{text}</p>;
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}
