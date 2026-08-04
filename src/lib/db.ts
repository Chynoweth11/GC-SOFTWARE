import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient, Prisma } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

/** Appending is the only operation the audit history accepts. */
const FORBIDDEN_ON_AUDIT = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
])

/**
 * Reinstates the triggers that make the audit history append only.
 *
 * A migration installs them, but a trigger is ordinary schema and can be dropped
 * by anyone holding the database file. Recreating them on every start means the
 * protection comes back on the next boot rather than staying quietly off.
 */
function installAuditGuards(client: PrismaClient) {
  const statements = [
    `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_update
     BEFORE UPDATE ON "AuditLog"
     BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be modified.'); END`,
    `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_delete
     BEFORE DELETE ON "AuditLog"
     BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be deleted.'); END`,
  ]
  return Promise.all(statements.map((sql) => client.$executeRawUnsafe(sql))).catch((error) => {
    console.error('Could not install the audit history guards', error)
  })
}

function createClient() {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  const adapter = new PrismaBetterSqlite3({ url })
  const base = new PrismaClient({ adapter })

  void installAuditGuards(base)

  // Refused in the client as well as in the database. The triggers are the real
  // guarantee; this states the intent at the call site and returns a plain
  // message rather than a raw SQLite abort.
  return base.$extends({
    query: {
      auditLog: {
        $allOperations({ operation, args, query }) {
          if (FORBIDDEN_ON_AUDIT.has(operation)) {
            throw new Error(
              `The audit history is permanent: ${operation} is not permitted on audit records.`,
            )
          }
          return query(args)
        },
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export type Db = typeof prisma
export { Prisma }
