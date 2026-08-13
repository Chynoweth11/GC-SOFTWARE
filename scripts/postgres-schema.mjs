#!/usr/bin/env node
/**
 * Derives the Postgres schema from the SQLite one.
 *
 * There is one hand-maintained schema, `prisma/schema.prisma`, and it says
 * sqlite because a fresh clone should run with no setup at all. Prisma refuses
 * to take the provider from an environment variable, so the Postgres schema is
 * generated from that one instead of being written twice. Two schemas kept in
 * step by hand would be two schemas out of step by the end of the month.
 *
 * Only the provider line changes. Every model, field, index and comment is
 * carried across untouched, so the two are the same schema by construction and
 * a field added in one is in the other the next time this runs.
 *
 *   node scripts/postgres-schema.mjs
 *
 * Writes prisma/postgres/schema.prisma, whose migrations live beside it.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const source = path.resolve(process.cwd(), 'prisma/schema.prisma')
const targetDir = path.resolve(process.cwd(), 'prisma/postgres')
const target = path.join(targetDir, 'schema.prisma')

const schema = readFileSync(source, 'utf8')

if (!/provider\s*=\s*"sqlite"/.test(schema)) {
  console.error('[postgres-schema] prisma/schema.prisma no longer says sqlite. Nothing was written.')
  process.exit(1)
}

const derived = schema
  .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
  // The generated client is shared: one client, one set of types, whichever
  // engine is behind it.
  .replace(/output\s*=\s*"([^"]+)"/, (match, output) => {
    if (output.startsWith('..')) return `output   = "../${output}"`
    return match
  })

const header = `// Generated from ../schema.prisma by scripts/postgres-schema.mjs.
// Do not edit. Change prisma/schema.prisma and run the script again.

`

mkdirSync(targetDir, { recursive: true })
writeFileSync(target, header + derived)
console.log(`[postgres-schema] Wrote ${path.relative(process.cwd(), target)}`)
