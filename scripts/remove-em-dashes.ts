/**
 * Sweeps em dashes, en dashes and ellipsis characters out of stored text.
 *
 * The software does not use them anywhere, but data arrives from spreadsheets
 * and pasted documents that do. This walks every text column in the database
 * generically, so a new table is covered the moment it exists.
 *
 * The audit history is skipped: it is append only by design, and rewriting it
 * to fix punctuation would be exactly the kind of edit it exists to prevent.
 */
import { prisma } from '../src/lib/db'

const EM_DASH = '—'
const EN_DASH = '–'
const ELLIPSIS = '…'

const SKIP_TABLES = new Set(['AuditLog', '_prisma_migrations'])

/** Replaces the characters, keeping the sentence readable rather than literal. */
export function clean(value: string): string {
  return value
    .replace(new RegExp(` ${EM_DASH} `, 'g'), ', ')
    .replace(new RegExp(`${EM_DASH} `, 'g'), '')
    .replace(new RegExp(` ${EM_DASH}`, 'g'), '')
    .replace(new RegExp(EM_DASH, 'g'), '-')
    .replace(new RegExp(EN_DASH, 'g'), '-')
    .replace(new RegExp(ELLIPSIS, 'g'), '...')
}

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  )

  let columnsScanned = 0
  let rowsChanged = 0
  const touched: string[] = []

  for (const { name: table } of tables) {
    if (SKIP_TABLES.has(table)) continue

    // PRAGMA returns integers as BigInt through this driver, so compare numerically.
    const columns = await prisma.$queryRawUnsafe<{ name: string; type: string; pk: number | bigint }[]>(
      `PRAGMA table_info("${table}")`,
    )
    const key = columns.find((column) => Number(column.pk) === 1)
    if (!key) continue

    const textColumns = columns.filter((column) => /char|clob|text/i.test(column.type))
    for (const column of textColumns) {
      columnsScanned++
      const rows = await prisma.$queryRawUnsafe<Record<string, string>[]>(
        `SELECT "${key.name}" AS id, "${column.name}" AS value FROM "${table}"
         WHERE "${column.name}" LIKE '%${EM_DASH}%'
            OR "${column.name}" LIKE '%${EN_DASH}%'
            OR "${column.name}" LIKE '%${ELLIPSIS}%'`,
      )

      for (const row of rows) {
        const next = clean(row.value)
        if (next === row.value) continue
        await prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "${column.name}" = ? WHERE "${key.name}" = ?`,
          next,
          row.id,
        )
        rowsChanged++
      }
      if (rows.length > 0) touched.push(`${table}.${column.name} (${rows.length})`)
    }
  }

  console.log(`Scanned ${columnsScanned} text columns across ${tables.length} tables.`)
  console.log(`Rewrote ${rowsChanged} values.`)
  for (const entry of touched) console.log('  ' + entry)
}

main().then(() => process.exit(0))
