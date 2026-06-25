const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8077";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface ColumnInfo {
  type: string;
  nullable: boolean;
  default: string | null;
}
export interface Schema {
  table: string;
  columns: Record<string, ColumnInfo>;
  primary_key: string[];
  indexes: { name: string | null; columns: string[]; unique: boolean }[];
}
export interface SchemaDiff {
  columns_only_in_a: string[];
  columns_only_in_b: string[];
  columns_changed: {
    column: string;
    differences: Record<string, { a: unknown; b: unknown }>;
  }[];
  primary_key: { a: string[]; b: string[]; match: boolean };
  identical: boolean;
}
export interface SchemaDiffResponse {
  schema_a: Schema;
  schema_b: Schema;
  diff: SchemaDiff;
}
export interface RowDiffResponse {
  key_columns: string[];
  row_counts: { a: number; b: number };
  matched: number;
  only_in_a: Record<string, unknown>[];
  only_in_b: Record<string, unknown>[];
  changed: {
    key: Record<string, unknown>;
    differences: Record<string, { a: unknown; b: unknown }>;
  }[];
  summary: {
    only_in_a: number;
    only_in_b: number;
    changed: number;
    identical_matched: number;
  };
  truncated: boolean;
}

export const api = {
  health: () => fetch(`${API_BASE}/api/health`).then((r) => r.ok),
  tables: (connection_string: string) =>
    post<{ tables: string[] }>("/api/tables", { connection_string }),
  schemaDiff: (body: {
    connection_a: string;
    connection_b: string;
    table_a: string;
    table_b: string;
  }) => post<SchemaDiffResponse>("/api/schema-diff", body),
  rowDiff: (body: {
    connection_a: string;
    connection_b: string;
    table_a: string;
    table_b: string;
    key_columns: string[];
    limit?: number;
  }) => post<RowDiffResponse>("/api/row-diff", body),
};
