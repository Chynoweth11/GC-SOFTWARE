import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Which schema and which migrations, decided by where the data lives.
 *
 * SQLite is the default so a fresh clone runs with no setup. Postgres is what a
 * company with more than one person saving at a time should be on, because
 * SQLite takes one writer at a time. Both read the same hand-maintained schema:
 * the Postgres one is generated from it by `scripts/postgres-schema.mjs`, so a
 * field added to one is in the other the next time that runs.
 *
 * The migrations are separate lineages on purpose. The SQL a migration emits is
 * dialect-specific, so one directory cannot serve both, and pretending it could
 * would fail at the least convenient moment.
 */
const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
const isPostgres = url.startsWith('postgres://') || url.startsWith('postgresql://')

export default defineConfig({
  schema: isPostgres ? path.join('prisma', 'postgres', 'schema.prisma') : path.join('prisma', 'schema.prisma'),
  migrations: {
    path: isPostgres ? path.join('prisma', 'postgres', 'migrations') : path.join('prisma', 'migrations'),
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: { url },
})
