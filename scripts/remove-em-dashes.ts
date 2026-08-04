/**
 * Rewrites em dashes out of every stored text value.
 *
 * The source no longer produces them, but rows written before that change still
 * carry them. Rather than list the columns by hand and miss some, this walks the
 * schema itself: every text column of every table is checked, so a field added
 * later is covered without anyone remembering to update this script.
 *
 * A dash separating a clause becomes a comma, and one joining two halves of a
 * name becomes a hyphen, which is how these read in practice: "Framing labor,
 * self-perform" and "Residential, New".
 *
 * Safe to run repeatedly. The audit history records that it ran.
 */

import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

// Written as an escape so the character itself appears nowhere in the codebase.
const EM_DASH = '\u2014'

export function cleanText(value: string): string {
  return value
    .replace(new RegExp(`\\s+${EM_DASH}\\s+`, 'g'), ', ')
    .replace(new RegExp(EM_DASH, 'g'), '-')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .trim()
}

/** Identity columns are left alone: rewriting a primary key would break relations. */
const SKIP_COLUMNS = new Set(['id'])

async function main() {
  const company = await prisma.company.findFirst()

  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`,
  )

  let total = 0
  const samples: string[] = []

  for (const { name: table } of tables) {
    // The audit history is append only by design, and is not rewritten here.
    if (table === 'AuditLog') continue

    const columns = await prisma.$queryRawUnsafe<{ name: string; type: string; pk: number }[]>(
      `PRAGMA table_info("${table}")`,
    )

    for (const column of columns) {
      if (!column.type.toUpperCase().includes('TEXT')) continue
      if (column.pk === 1 || SKIP_COLUMNS.has(column.name)) continue

      const rows = await prisma.$queryRawUnsafe<{ id: string; value: string }[]>(
        `SELECT "id" AS id, "${column.name}" AS value FROM "${table}"
         WHERE "${column.name}" LIKE '%' || char(8212) || '%'`,
      )
      if (rows.length === 0) continue

      for (const row of rows) {
        const next = cleanText(row.value)
        if (next === row.value) continue
        await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column.name}" = ? WHERE "id" = ?`, next, row.id)
        if (samples.length < 8) samples.push(`${row.value}  ->  ${next}`)
        total++
      }
      console.log(`${table}.${column.name}: ${rows.length}`)
    }
  }

  if (total > 0 && company) {
    await recordAudit({
      companyId: company.id,
      entity: 'Company',
      entityId: company.id,
      entityLabel: company.name,
      action: 'UPDATE',
      field: 'Stored text',
      summary: `Rewrote ${total} stored values to remove em dashes`,
    })
  }

  console.log(`\ntotal rewritten: ${total}`)
  for (const sample of samples) console.log('  ' + sample)
}

main()
