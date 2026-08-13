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

import { existsSync, readFileSync, statSync } from 'node:fs'
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

/*
  The generated client is baked to one engine.

  Prisma writes the provider into the client at generate time, so a client
  generated for SQLite refuses to talk to Postgres and the other way round. The
  error it gives is accurate but arrives at the first query, which is a long way
  from the thing that caused it. So the provider is checked here, before
  anything runs, and the client is regenerated when it disagrees with the
  connection string.
*/
function generatedProvider() {
  const clientPath = path.resolve(process.cwd(), 'src/generated/prisma/index.js')
  if (!existsSync(clientPath)) return null
  const match = readFileSync(clientPath, 'utf8').match(/activeProvider"\s*:\s*"([a-z]+)"/i)
  return match ? match[1] : null
}

const wantsPostgres = url.startsWith('postgres://') || url.startsWith('postgresql://')
const wanted = wantsPostgres ? 'postgresql' : 'sqlite'
const generated = generatedProvider()

if (generated !== null && generated !== wanted) {
  console.log(`[ensure-db] The generated client is for ${generated}; regenerating it for ${wanted}.`)
  run('npx', ['--yes', 'prisma', 'generate'])
}

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
