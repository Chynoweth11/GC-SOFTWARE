import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

/**
 * Which database engine, decided by the connection string and nothing else.
 *
 * One place makes this decision, because the application, the seed and every
 * verification script all have to make it the same way. A seed that quietly
 * opened SQLite while the app talked to Postgres would look like it worked
 * right up until somebody went looking for the data.
 *
 * SQLite is the default so a fresh clone runs with no setup at all, and it is
 * genuinely enough for one office on one machine with a backup behind it.
 * Postgres is what a company with more than one person saving at a time should
 * be on: SQLite takes one writer at a time, so two project managers pressing
 * save together will queue behind each other.
 */

export const DEFAULT_DATABASE_URL = 'file:./prisma/dev.db'

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
}

export function isPostgres(url: string = databaseUrl()): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://')
}

/**
 * The driver adapter for that engine.
 *
 * The Postgres one is loaded at the moment it is needed, by a name built at
 * runtime so the bundler leaves it alone. A deployment on SQLite must not be
 * required to install a Postgres driver it will never open.
 */
export function createAdapter(url: string = databaseUrl()) {
  if (!isPostgres(url)) return new PrismaBetterSqlite3({ url })

  const moduleName = '@prisma/adapter-pg'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(moduleName) as {
    PrismaPg: new (config: { connectionString: string }) => never
  }
  return new loaded.PrismaPg({ connectionString: url })
}

/**
 * The statements that make the audit history append only.
 *
 * Both engines refuse the same two operations with the same sentence, and they
 * say it differently enough that the difference has to be written down once
 * rather than in every place that installs or lifts them. SQLite raises from
 * inside the trigger body; Postgres needs a function to raise from.
 */
export function auditGuardStatements(url: string = databaseUrl()): string[] {
  if (isPostgres(url)) {
    return [
      `CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'The audit history is permanent and cannot be modified or deleted.';
       END;
       $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS audit_log_is_append_only_update ON "AuditLog"`,
      `CREATE TRIGGER audit_log_is_append_only_update
       BEFORE UPDATE ON "AuditLog"
       FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only()`,
      `DROP TRIGGER IF EXISTS audit_log_is_append_only_delete ON "AuditLog"`,
      `CREATE TRIGGER audit_log_is_append_only_delete
       BEFORE DELETE ON "AuditLog"
       FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only()`,
    ]
  }

  return [
    `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_update
     BEFORE UPDATE ON "AuditLog"
     BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be modified.'); END`,
    `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_delete
     BEFORE DELETE ON "AuditLog"
     BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be deleted.'); END`,
  ]
}

/** Taking them off, for the one operation allowed to: rebuilding from seed. */
export function dropAuditGuardStatements(url: string = databaseUrl()): string[] {
  const on = isPostgres(url) ? ' ON "AuditLog"' : ''
  return [
    `DROP TRIGGER IF EXISTS audit_log_is_append_only_update${on}`,
    `DROP TRIGGER IF EXISTS audit_log_is_append_only_delete${on}`,
  ]
}
