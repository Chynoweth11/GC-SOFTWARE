'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

function parseDate(value: FormDataEntryValue | null): Date {
  const raw = String(value ?? '')
  const parsed = raw ? new Date(`${raw}T00:00:00.000Z`) : new Date()
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

export async function createCostTransaction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:costs')

  const projectId = String(formData.get('projectId'))
  const costCodeId = String(formData.get('costCodeId'))
  const amount = Number(formData.get('amount'))
  const description = String(formData.get('description') ?? '').trim()

  if (!costCodeId) return { error: 'Choose a line item.' }
  if (!isFinite(amount) || amount === 0) return { error: 'Enter an amount.' }
  if (!description) return { error: 'Enter a description so the transaction can be recognised later.' }

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'Project not found.' }

  const vendorId = String(formData.get('vendorId') ?? '') || null
  const commitmentId = String(formData.get('commitmentId') ?? '') || null
  const hoursRaw = Number(formData.get('hours'))

  const tx = await prisma.costTransaction.create({
    data: {
      projectId,
      costCodeId,
      date: parseDate(formData.get('date')),
      type: (String(formData.get('type') ?? 'ACTUAL') as 'ACTUAL' | 'ACCRUAL'),
      source: 'MANUAL',
      vendorId,
      commitmentId,
      description,
      reference: String(formData.get('reference') ?? '') || null,
      amount,
      hours: isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : null,
      notes: String(formData.get('notes') ?? '') || null,
      attachmentName: String(formData.get('attachmentName') ?? '') || null,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'CostTransaction',
    entityId: tx.id,
    action: 'CREATE',
    summary: `Posted ${amount} to ${costCodeId}, ${description}`,
  })

  revalidatePath(`/projects/${projectId}/costs`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/** Corrects the line item on a transaction, keeping a record of what it was. */
export async function recodeTransaction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:costs')

  const transactionId = String(formData.get('transactionId'))
  const costCodeId = String(formData.get('costCodeId'))
  if (!costCodeId) return { error: 'Choose the line item to move this transaction to.' }

  const existing = await prisma.costTransaction.findFirst({
    where: { id: transactionId, project: { companyId: user.companyId } },
    include: { costCode: true },
  })
  if (!existing) return { error: 'Transaction not found.' }

  const target = await prisma.costCode.findFirst({ where: { id: costCodeId, companyId: user.companyId } })
  if (!target) return { error: 'That line item does not belong to this company.' }

  await prisma.costTransaction.update({
    where: { id: transactionId },
    data: { costCodeId, needsCoding: false },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'CostTransaction',
    entityId: transactionId,
    action: 'RECODE',
    field: 'costCode',
    oldValue: existing.costCode.code,
    newValue: target.code,
    summary: `Recoded ${existing.description} from ${existing.costCode.code} to ${target.code}`,
  })

  revalidatePath(`/projects/${existing.projectId}/costs`)
  revalidatePath(`/projects/${existing.projectId}`)
  return {}
}

/**
 * Splits one transaction across two line items. The original is reduced rather
 * than deleted so the source document still ties to a row in the ledger.
 */
export async function splitTransaction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:costs')

  const transactionId = String(formData.get('transactionId'))
  const costCodeId = String(formData.get('splitCostCodeId'))
  const splitAmount = Number(formData.get('splitAmount'))

  const existing = await prisma.costTransaction.findFirst({
    where: { id: transactionId, project: { companyId: user.companyId } },
    include: { costCode: true },
  })
  if (!existing) return { error: 'Transaction not found.' }
  if (!costCodeId) return { error: 'Choose the line item to split into.' }
  if (!isFinite(splitAmount) || splitAmount <= 0) return { error: 'Enter a split amount greater than zero.' }
  if (Math.abs(splitAmount) >= Math.abs(existing.amount)) {
    return { error: 'The split must be smaller than the transaction. To move the whole amount, recode it instead.' }
  }

  const sign = existing.amount < 0 ? -1 : 1
  const moved = sign * Math.abs(splitAmount)

  await prisma.$transaction([
    prisma.costTransaction.update({
      where: { id: transactionId },
      data: { amount: existing.amount - moved, needsCoding: false },
    }),
    prisma.costTransaction.create({
      data: {
        projectId: existing.projectId,
        costCodeId,
        date: existing.date,
        type: existing.type,
        source: existing.source,
        vendorId: existing.vendorId,
        commitmentId: existing.commitmentId,
        description: `${existing.description} (split)`,
        reference: existing.reference,
        amount: moved,
        notes: `Split from transaction on ${existing.costCode.code}`,
      },
    }),
  ])

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'CostTransaction',
    entityId: transactionId,
    action: 'SPLIT',
    summary: `Split ${moved} out of ${existing.description} into a second line item`,
  })

  revalidatePath(`/projects/${existing.projectId}/costs`)
  revalidatePath(`/projects/${existing.projectId}`)
  return {}
}

/** Soft delete: the row leaves every total but stays recoverable. */
export async function softDeleteTransaction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:costs')

  const transactionId = String(formData.get('transactionId'))
  const existing = await prisma.costTransaction.findFirst({
    where: { id: transactionId, project: { companyId: user.companyId } },
  })
  if (!existing) return { error: 'Transaction not found.' }

  await prisma.costTransaction.update({ where: { id: transactionId }, data: { deletedAt: new Date() } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'CostTransaction',
    entityId: transactionId,
    action: 'DELETE',
    summary: `Removed ${existing.description} (${existing.amount}) from the ledger, recoverable`,
  })

  revalidatePath(`/projects/${existing.projectId}/costs`)
  revalidatePath(`/projects/${existing.projectId}`)
  return {}
}
