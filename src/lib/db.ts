import { PrismaClient, Prisma } from '@/generated/prisma/client'
import { auditGuardStatements, createAdapter, databaseUrl } from './db-adapter'

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
 * A migration installs them, but a trigger is ordinary schema and can be
 * dropped by anyone holding the database. Recreating them on every start means
 * the protection comes back on the next boot rather than staying quietly off.
 *
 * In order rather than in parallel: on Postgres the triggers depend on the
 * function existing first.
 */
function installAuditGuards(client: PrismaClient, url: string) {
  return auditGuardStatements(url)
    .reduce(
      (chain, sql) => chain.then(() => client.$executeRawUnsafe(sql)).then(() => undefined),
      Promise.resolve(),
    )
    .catch((error) => {
      console.error('Could not install the audit history guards', error)
    })
}

function createClient() {
  const url = databaseUrl()
  const base = new PrismaClient({ adapter: createAdapter(url) })

  void installAuditGuards(base, url)

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
