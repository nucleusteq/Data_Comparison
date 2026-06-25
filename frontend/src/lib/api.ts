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
  autoincrement?: boolean;
}
export interface IndexInfo {
  name: string | null;
  columns: string[];
  unique: boolean;
}
export interface ForeignKeyInfo {
  columns: string[];
  referred_table: string | null;
  referred_columns: string[];
}
export interface UniqueConstraintInfo {
  name: string | null;
  columns: string[];
}
export interface CheckConstraintInfo {
  name: string | null;
  sqltext: string;
}
export interface Schema {
  table: string;
  columns: Record<string, ColumnInfo>;
  primary_key: string[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
  unique_constraints: UniqueConstraintInfo[];
  check_constraints: CheckConstraintInfo[];
}
/** Added/removed pairs for a structural schema object (indexes, FKs, etc.). */
export interface StructuralDiff<T> {
  only_in_a: T[];
  only_in_b: T[];
}
export interface SchemaDiff {
  columns_only_in_a: string[];
  columns_only_in_b: string[];
  columns_changed: {
    column: string;
    differences: Record<string, { a: unknown; b: unknown }>;
  }[];
  primary_key: { a: string[]; b: string[]; match: boolean };
  indexes: StructuralDiff<IndexInfo>;
  foreign_keys: StructuralDiff<ForeignKeyInfo>;
  unique_constraints: StructuralDiff<UniqueConstraintInfo>;
  check_constraints: StructuralDiff<CheckConstraintInfo>;
  identical: boolean;
}
export interface SchemaDiffResponse {
  schema_a: Schema;
  schema_b: Schema;
  diff: SchemaDiff;
}
export interface RowDiffResponse {
  key_columns: string[];
  column_map?: Record<string, string>;
  ignored_columns?: string[];
  compared_columns?: string[];
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
  warnings?: string[];
}
export interface QuickCountResponse {
  row_counts: { a: number; b: number };
  counts_match: boolean;
  delta: number;
}

export const api = {
  health: () => fetch(`${API_BASE}/api/health`).then((r) => r.ok),
  tables: (connection_string: string) =>
    post<{ tables: string[] }>("/api/tables", { connection_string }),
  columns: (connection_string: string, table: string) =>
    post<{ columns: string[]; primary_key: string[] }>("/api/columns", {
      connection_string,
      table,
    }),
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
    column_map?: Record<string, string>;
    ignore_columns?: string[];
    where_a?: string | null;
    where_b?: string | null;
  }) => post<RowDiffResponse>("/api/row-diff", body),
  quickCount: (body: {
    connection_a: string;
    connection_b: string;
    table_a: string;
    table_b: string;
    where_a?: string | null;
    where_b?: string | null;
  }) => post<QuickCountResponse>("/api/quick-count", body),
  syncSql: (body: { row_diff: RowDiffResponse; target_table: string }) =>
    post<{ sql: string }>("/api/sync-sql", body),
};
