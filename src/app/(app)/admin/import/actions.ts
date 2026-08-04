'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { parseWorkbook, asNumber, asDate, asText } from '@/lib/excel'
import { createHash } from 'node:crypto'

export interface ImportResult {
  error?: string
  imported?: number
  skippedDuplicates?: number
  needsCoding?: number
  unmatchedCodes?: string[]
  message?: string
}

/**
 * Imports accounting cost transactions from a spreadsheet.
 *
 * Two safeguards matter more than speed here: a hash of the source row prevents
 * the same export being loaded twice, and a row whose line item doesn't exist on
 * the project is still imported but flagged for coding rather than dropped,
 * losing a cost silently is far worse than showing it uncoded.
 */
export async function importCostTransactions(formData: FormData): Promise<ImportResult> {
  const user = await requireUser()
  assertCan(user.role, 'import:data')

  const projectId = String(formData.get('projectId'))
  const file = formData.get('file')

  if (!projectId) return { error: 'Choose the project to import into.' }
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a spreadsheet to import.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'That file is larger than 10 MB. Split it and import in parts.' }

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'Project not found.' }

  let parsed
  try {
    parsed = await parseWorkbook(await file.arrayBuffer())
  } catch {
    return { error: 'That file could not be read as a spreadsheet. Save it as .xlsx and try again.' }
  }

  if (parsed.rows.length === 0) return { error: 'No data rows found. The first row must be the column headers.' }

  const required = ['date', 'line item', 'description', 'amount']
  const missing = required.filter((header) => !parsed.headers.includes(header))
  if (missing.length > 0) {
    return {
      error: `The spreadsheet is missing these columns: ${missing.join(', ')}. Expected headers: date, line item, description, amount, and optionally vendor, reference, type and hours.`,
    }
  }

  const [costCodes, vendors, existing] = await Promise.all([
    prisma.costCode.findMany({ where: { companyId: user.companyId } }),
    prisma.vendor.findMany({ where: { companyId: user.companyId } }),
    prisma.costTransaction.findMany({ where: { projectId }, select: { importHash: true } }),
  ])

  const codeByCode = new Map(costCodes.map((c) => [c.code.toUpperCase(), c]))
  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v]))
  const existingHashes = new Set(existing.map((e) => e.importHash).filter(Boolean) as string[])

  // Anything that cannot be coded lands on a holding code rather than being lost.
  let holdingCode = codeByCode.get('UNCODED')
  if (!holdingCode) {
    holdingCode = await prisma.costCode.create({
      data: {
        companyId: user.companyId,
        code: 'UNCODED',
        description: 'Imported cost awaiting a line item',
        category: 'OTHER',
        sortOrder: 9999,
      },
    })
  }

  let imported = 0
  let skippedDuplicates = 0
  let needsCoding = 0
  const unmatchedCodes = new Set<string>()

  for (const row of parsed.rows) {
    const date = asDate(row.values['date'])
    const codeText = asText(row.values['line item']).toUpperCase()
    const description = asText(row.values['description'])
    const amount = asNumber(row.values['amount'])

    if (!date || amount === 0) continue

    const hash = createHash('sha256')
      .update(`${projectId}|${date.toISOString().slice(0, 10)}|${codeText}|${description}|${amount.toFixed(2)}`)
      .digest('hex')

    if (existingHashes.has(hash)) {
      skippedDuplicates++
      continue
    }
    existingHashes.add(hash)

    const costCode = codeByCode.get(codeText)
    if (!costCode && codeText) unmatchedCodes.add(codeText)
    if (!costCode) needsCoding++

    const vendorName = asText(row.values['vendor'])
    const vendor = vendorName ? vendorByName.get(vendorName.toLowerCase()) : undefined
    const typeText = asText(row.values['type']).toUpperCase()
    const hours = asNumber(row.values['hours'])

    await prisma.costTransaction.create({
      data: {
        projectId,
        costCodeId: (costCode ?? holdingCode).id,
        date,
        type: typeText === 'ACCRUAL' ? 'ACCRUAL' : 'ACTUAL',
        source: 'IMPORT',
        vendorId: vendor?.id ?? null,
        description: description || 'Imported cost',
        reference: asText(row.values['reference']) || `Import ${file.name}`,
        amount,
        hours: hours > 0 ? hours : null,
        needsCoding: !costCode,
        importHash: hash,
      },
    })
    imported++
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Project',
    entityId: projectId,
    action: 'IMPORT',
    summary: `Imported ${imported} cost transactions from "${file.name}", ${skippedDuplicates} duplicates skipped, ${needsCoding} needing a line item`,
  })

  revalidatePath(`/projects/${projectId}/costs`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/admin/import')

  return {
    imported,
    skippedDuplicates,
    needsCoding,
    unmatchedCodes: [...unmatchedCodes].slice(0, 20),
    message:
      imported === 0
        ? 'Nothing new was imported: every row was already in the ledger.'
        : `Imported ${imported} transaction${imported === 1 ? '' : 's'}.${needsCoding > 0 ? ` ${needsCoding} need a line item assigning on the job cost tab.` : ''}`,
  }
}
