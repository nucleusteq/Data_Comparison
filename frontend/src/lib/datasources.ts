export type DbKind =
  | "postgresql"
  | "mysql"
  | "mssql"
  | "oracle"
  | "snowflake"
  | "sqlite"
  | "custom";

export interface DataSource {
  id: string;
  name: string;
  kind: DbKind;
  /** Structured connection fields, keyed by field name (see FIELD specs). */
  fields: Record<string, string>;
  /** Assembled SQLAlchemy URL, derived from kind + fields. */
  connectionString: string;
}

export function newId(): string {
  // Stable, collision-resistant enough for client-side list keys.
  return `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface FieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "number";
  required?: boolean;
  default?: string;
}

export interface KindSpec {
  kind: DbKind;
  label: string;
  /** Python driver to install (shown as a hint). */
  driver?: string;
  fields: FieldSpec[];
  /** Build a SQLAlchemy URL from the field values. */
  build: (f: Record<string, string>) => string;
}

const enc = (v: string) => encodeURIComponent(v ?? "");

const hostPortFields = (defaultPort: string): FieldSpec[] => [
  { key: "host", label: "Host name", placeholder: "localhost", required: true },
  { key: "port", label: "Port", type: "number", default: defaultPort, placeholder: defaultPort },
  { key: "database", label: "Database", placeholder: "mydb", required: true },
  { key: "username", label: "Username", placeholder: "user", required: true },
  { key: "password", label: "Password", type: "password" },
];

export const KINDS: KindSpec[] = [
  {
    kind: "postgresql",
    label: "PostgreSQL",
    driver: "psycopg[binary] (psycopg3)",
    fields: hostPortFields("5432"),
    build: (f) =>
      `postgresql+psycopg://${enc(f.username)}:${enc(f.password)}@${f.host}:${f.port || "5432"}/${enc(f.database)}`,
  },
  {
    kind: "mysql",
    label: "MySQL / MariaDB",
    driver: "PyMySQL",
    fields: hostPortFields("3306"),
    build: (f) =>
      `mysql+pymysql://${enc(f.username)}:${enc(f.password)}@${f.host}:${f.port || "3306"}/${enc(f.database)}`,
  },
  {
    kind: "mssql",
    label: "SQL Server",
    driver: "pyodbc (+ system ODBC driver)",
    fields: [
      ...hostPortFields("1433"),
      {
        key: "odbcDriver",
        label: "ODBC driver",
        default: "ODBC Driver 18 for SQL Server",
        placeholder: "ODBC Driver 18 for SQL Server",
      },
    ],
    build: (f) =>
      `mssql+pyodbc://${enc(f.username)}:${enc(f.password)}@${f.host}:${f.port || "1433"}/${enc(f.database)}?driver=${enc(f.odbcDriver || "ODBC Driver 18 for SQL Server")}`,
  },
  {
    kind: "oracle",
    label: "Oracle",
    driver: "oracledb",
    fields: [
      { key: "host", label: "Host name", placeholder: "localhost", required: true },
      { key: "port", label: "Port", type: "number", default: "1521", placeholder: "1521" },
      { key: "serviceName", label: "Service name", placeholder: "ORCLPDB1", required: true },
      { key: "username", label: "Username", placeholder: "user", required: true },
      { key: "password", label: "Password", type: "password" },
    ],
    build: (f) =>
      `oracle+oracledb://${enc(f.username)}:${enc(f.password)}@${f.host}:${f.port || "1521"}/?service_name=${enc(f.serviceName)}`,
  },
  {
    kind: "snowflake",
    label: "Snowflake",
    driver: "snowflake-sqlalchemy",
    fields: [
      { key: "account", label: "Account identifier", placeholder: "xy12345.us-east-1", required: true },
      { key: "username", label: "Username", placeholder: "user", required: true },
      { key: "password", label: "Password", type: "password" },
      { key: "database", label: "Database", placeholder: "MYDB", required: true },
      { key: "schema", label: "Schema", placeholder: "PUBLIC", default: "PUBLIC" },
      { key: "warehouse", label: "Warehouse", placeholder: "COMPUTE_WH" },
      { key: "role", label: "Role", placeholder: "ACCOUNTADMIN" },
    ],
    build: (f) => {
      const params = new URLSearchParams();
      if (f.warehouse) params.set("warehouse", f.warehouse);
      if (f.role) params.set("role", f.role);
      const qs = params.toString();
      return `snowflake://${enc(f.username)}:${enc(f.password)}@${f.account}/${enc(f.database)}/${enc(f.schema || "PUBLIC")}${qs ? `?${qs}` : ""}`;
    },
  },
  {
    kind: "sqlite",
    label: "SQLite",
    fields: [
      {
        key: "path",
        label: "Database file (absolute path)",
        placeholder: "/absolute/path/to/database.db",
        required: true,
      },
    ],
    build: (f) => `sqlite:///${f.path}`,
  },
  {
    kind: "custom",
    label: "Custom (raw URL)",
    fields: [
      {
        key: "url",
        label: "SQLAlchemy URL",
        placeholder: "dialect+driver://user:pass@host:port/db",
        required: true,
      },
    ],
    build: (f) => f.url || "",
  },
];

export function kindSpec(kind: DbKind): KindSpec {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[0];
}

export function buildConnectionString(kind: DbKind, fields: Record<string, string>): string {
  return kindSpec(kind).build(fields);
}

/** Defaults for a kind's fields (used when switching type in the form). */
export function defaultFields(kind: DbKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of kindSpec(kind).fields) out[f.key] = f.default ?? "";
  return out;
}

/**
 * Return the keys of required fields that are empty for this kind.
 * Used to block saving an incomplete connection.
 */
export function missingRequiredFields(
  kind: DbKind,
  fields: Record<string, string>
): string[] {
  return kindSpec(kind)
    .fields.filter((f) => f.required && !(fields[f.key] ?? "").trim())
    .map((f) => f.key);
}
