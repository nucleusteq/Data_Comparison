"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  DataSource,
  DbKind,
  KINDS,
  kindSpec,
  newId,
  buildConnectionString,
  defaultFields,
} from "@/lib/datasources";
import { SettingsNav } from "@/components/SettingsNav";

interface Props {
  sources: DataSource[];
  setSources: (updater: (s: DataSource[]) => DataSource[]) => void;
  selectedAId: string | null;
  selectedBId: string | null;
  onPick: (slot: "A" | "B", id: string) => void;
}

type TestState = "idle" | "testing" | "ok" | "fail";

const KIND_ICON: Record<DbKind, string> = {
  postgresql: "🐘",
  mysql: "🐬",
  mssql: "🟦",
  oracle: "🔴",
  snowflake: "❄️",
  sqlite: "📄",
  custom: "🔗",
};

export function DataSourceNav({
  sources,
  setSources,
  selectedAId,
  selectedBId,
  onPick,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  // Draft form state.
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<DbKind>("postgresql");
  const [draftFields, setDraftFields] = useState<Record<string, string>>(
    defaultFields("postgresql")
  );
  const [draftTest, setDraftTest] = useState<{ state: TestState; msg?: string }>({
    state: "idle",
  });

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraftName("");
    setDraftKind("postgresql");
    setDraftFields(defaultFields("postgresql"));
    setDraftTest({ state: "idle" });
  };

  const startEdit = (ds: DataSource) => {
    setAdding(false);
    setEditingId(ds.id);
    setDraftName(ds.name);
    setDraftKind(ds.kind);
    setDraftFields({ ...defaultFields(ds.kind), ...ds.fields });
    setDraftTest({ state: "idle" });
  };

  const cancel = () => {
    setAdding(false);
    setEditingId(null);
  };

  const changeKind = (kind: DbKind) => {
    setDraftKind(kind);
    setDraftFields(defaultFields(kind));
    setDraftTest({ state: "idle" });
  };

  const setField = (key: string, value: string) => {
    setDraftFields((f) => ({ ...f, [key]: value }));
    setDraftTest({ state: "idle" });
  };

  const testDraft = async () => {
    const conn = buildConnectionString(draftKind, draftFields).trim();
    if (!conn) {
      setDraftTest({ state: "fail", msg: "Fill in the connection fields first." });
      return;
    }
    setDraftTest({ state: "testing" });
    try {
      const { tables } = await api.tables(conn);
      setDraftTest({ state: "ok", msg: `Connected — ${tables.length} table(s) found.` });
    } catch (e) {
      setDraftTest({ state: "fail", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const save = () => {
    const spec = kindSpec(draftKind);
    const name = draftName.trim() || spec.label;
    const connectionString = buildConnectionString(draftKind, draftFields).trim();
    if (!connectionString) return;
    if (adding) {
      setSources((s) => [
        ...s,
        { id: newId(), name, kind: draftKind, fields: draftFields, connectionString },
      ]);
    } else if (editingId) {
      setSources((s) =>
        s.map((d) =>
          d.id === editingId
            ? { ...d, name, kind: draftKind, fields: draftFields, connectionString }
            : d
        )
      );
    }
    cancel();
  };

  const remove = (id: string) => setSources((s) => s.filter((d) => d.id !== id));

  const testSaved = async (ds: DataSource) => {
    setTests((t) => ({ ...t, [ds.id]: "testing" }));
    try {
      await api.tables(ds.connectionString);
      setTests((t) => ({ ...t, [ds.id]: "ok" }));
    } catch {
      setTests((t) => ({ ...t, [ds.id]: "fail" }));
    }
  };

  const spec = kindSpec(draftKind);
  const preview = buildConnectionString(draftKind, draftFields);

  const editor = (
    <div className="space-y-3 rounded-xl border border-indigo-200 bg-white p-3 shadow-sm animate-fade-in dark:border-indigo-800 dark:bg-gray-800">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-600">
          1. Database type
        </span>
        <select
          className="input"
          value={draftKind}
          onChange={(e) => changeKind(e.target.value as DbKind)}
          autoFocus
        >
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {KIND_ICON[k.kind]} {k.label}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="block text-xs font-semibold text-gray-600">
          2. Connection details
        </span>
        <input
          className="input"
          placeholder="Display name (e.g. Prod DB)"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
        {spec.fields.map((field) => (
          <input
            key={field.key}
            className="input"
            type={
              field.type === "password"
                ? "password"
                : field.type === "number"
                ? "number"
                : "text"
            }
            placeholder={field.label + (field.required ? " *" : "")}
            value={draftFields[field.key] ?? ""}
            onChange={(e) => setField(field.key, e.target.value)}
          />
        ))}
      </div>

      {spec.driver && (
        <p className="text-[11px] text-gray-400">
          Needs Python driver: <span className="font-mono">{spec.driver}</span>
        </p>
      )}

      {preview && (
        <div className="rounded-lg bg-gray-50 p-2 font-mono text-[11px] break-all text-gray-500">
          {maskConn(preview)}
        </div>
      )}

      {/* Step 3: test connectivity before saving */}
      <button
        className="btn btn-ghost w-full !py-1.5 text-xs"
        onClick={testDraft}
        disabled={draftTest.state === "testing"}
      >
        {draftTest.state === "testing" ? (
          <>
            <Spinner /> Testing…
          </>
        ) : (
          "🔌 Test connection"
        )}
      </button>
      {draftTest.state === "ok" && (
        <p className="rounded bg-green-50 px-2 py-1 text-[11px] text-green-700">
          ✓ {draftTest.msg}
        </p>
      )}
      {draftTest.state === "fail" && (
        <p className="rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700 break-all">
          ✗ {draftTest.msg}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button className="btn btn-primary flex-1 !py-1.5 text-xs" onClick={save}>
          Save
        </button>
        <button className="btn btn-ghost flex-1 !py-1.5 text-xs" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-gray-200 bg-gray-100/70 dark:border-gray-700 dark:bg-gray-900/80">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-200">
          DATA SOURCES
          <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {sources.length}
          </span>
        </h2>
        <button className="btn btn-primary !px-2.5 !py-1 text-xs" onClick={startAdd}>
          + Add
        </button>
      </div>

      {/* Select which sources are compared as A and B */}
      {sources.length > 0 && (
        <div className="space-y-2 border-b border-gray-200 bg-white/60 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <SourceSelect
            slot="A"
            sources={sources}
            value={selectedAId}
            onChange={(id) => onPick("A", id)}
          />
          <SourceSelect
            slot="B"
            sources={sources}
            value={selectedBId}
            onChange={(id) => onPick("B", id)}
          />
        </div>
      )}

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
        {adding && editor}

        {sources.length === 0 && !adding && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center">
            <div className="text-3xl">🗄️</div>
            <p className="mt-2 text-sm text-gray-500">
              No data sources yet.
            </p>
            <button className="btn btn-primary mt-3 !py-1.5 text-xs" onClick={startAdd}>
              + Add your first source
            </button>
          </div>
        )}

        {sources.map((ds) =>
          editingId === ds.id ? (
            <div key={ds.id}>{editor}</div>
          ) : (
            <div
              key={ds.id}
              className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-indigo-300 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="text-lg leading-none">{KIND_ICON[ds.kind]}</span>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-800 dark:text-gray-100" title={ds.name}>
                      {ds.name}
                    </div>
                    <div
                      className="truncate font-mono text-[11px] text-gray-400"
                      title={ds.connectionString}
                    >
                      {maskConn(ds.connectionString)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedAId === ds.id && (
                    <span className="chip bg-rose-600 text-white">A</span>
                  )}
                  {selectedBId === ds.id && (
                    <span className="chip bg-emerald-600 text-white">B</span>
                  )}
                  <TestDot state={tests[ds.id] ?? "idle"} />
                </div>
              </div>

              <div className="mt-2.5 flex gap-3 text-xs">
                <button className="text-indigo-600 hover:underline" onClick={() => testSaved(ds)}>
                  Test
                </button>
                <button className="text-gray-600 hover:underline" onClick={() => startEdit(ds)}>
                  Edit
                </button>
                <button className="text-rose-600 hover:underline" onClick={() => remove(ds.id)}>
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <div className="border-t border-gray-200 px-4 py-2.5 text-[11px] text-gray-400">
        🔒 Stored only in your browser (localStorage).
      </div>

      <SettingsNav />
    </aside>
  );
}

function SourceSelect({
  slot,
  sources,
  value,
  onChange,
}: {
  slot: "A" | "B";
  sources: DataSource[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const dot = slot === "A" ? "bg-rose-500" : "bg-emerald-500";
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        Select data source {slot}
      </span>
      <select
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Choose a source…
        </option>
        {sources.map((ds) => (
          <option key={ds.id} value={ds.id}>
            {KIND_ICON[ds.kind]} {ds.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function TestDot({ state }: { state: TestState }) {
  const map: Record<TestState, { color: string; title: string }> = {
    idle: { color: "bg-gray-300", title: "Not tested" },
    testing: { color: "bg-amber-400 animate-pulse", title: "Testing…" },
    ok: { color: "bg-green-500", title: "Connection OK" },
    fail: { color: "bg-rose-500", title: "Connection failed" },
  };
  const { color, title } = map[state];
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} title={title} />;
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
  );
}

// Hide credentials in the displayed connection string.
function maskConn(conn: string): string {
  return conn.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:••••@");
}
