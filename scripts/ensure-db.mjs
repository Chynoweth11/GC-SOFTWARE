#!/usr/bin/env node
/**
 * Makes sure there is a database to talk to before the app starts.
 *
 * A fresh clone has no SQLite file: it is deliberately not committed, because a
 * binary database in version control goes stale and conflicts on every merge. So
 * the first `npm run dev` creates it from the migrations and loads the workbook
 * seed data. Every run after that finds the file and does nothing, which keeps
 * startup fast.
 *
 * Deleting the file is therefore a supported way to start over.
 */

import { existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_URL = 'file:./prisma/dev.db'

/** Resolves the sqlite path from a Prisma `file:` URL, relative to the project root. */
function databaseFile(url) {
  if (!url.startsWith('file:')) return null // Postgres and friends manage themselves
  const raw = url.slice('file:'.length)
  return path.resolve(process.cwd(), raw)
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', env: process.env })
}

const url = process.env.DATABASE_URL ?? DEFAULT_URL
const file = databaseFile(url)

if (!file) {
  console.log(`[ensure-db] DATABASE_URL points at a managed database; skipping setup.`)
  process.exit(0)
}

const missing = !existsSync(file) || statSync(file).size === 0

if (!missing) process.exit(0)

console.log(`[ensure-db] No database at ${path.relative(process.cwd(), file)}: creating it.`)

try {
  run('npx', ['--yes', 'prisma', 'migrate', 'deploy'])
  console.log('[ensure-db] Loading the workbook seed data.')
  run('npx', ['--yes', 'tsx', 'prisma/seed.ts'])
  console.log('[ensure-db] Ready. Sign in as owner@constructx.com / constructx')
} catch (error) {
  console.error('\n[ensure-db] Could not prepare the database.')
  console.error('[ensure-db] Run these by hand to see the full error:')
  console.error('[ensure-db]   npx prisma migrate deploy')
  console.error('[ensure-db]   npx tsx prisma/seed.ts')
  process.exit(error.status ?? 1)
}
