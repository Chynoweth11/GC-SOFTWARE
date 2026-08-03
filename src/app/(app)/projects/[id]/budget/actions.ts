'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

/**
 * Moves budget between two cost codes.
 *
 * Recorded as two linked revisions rather than by editing the original budget —
 * the brief's requirement that budget history is never overwritten. The pair
 * shares a transfer group so the two halves can always be read back together.
 */
export async function transferBudget(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:budget')

  const projectId = String(formData.get('projectId'))
  const fromLineId = String(formData.get('fromLineId'))
  const toLineId = String(formData.get('toLineId'))
  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!fromLineId || !toLineId) return { error: 'Select both a source and a destination cost code.' }
  if (fromLineId === toLineId) return { error: 'The source and destination cost codes must be different.' }
  if (!isFinite(amount) || amount <= 0) return { error: 'Enter a transfer amount greater than zero.' }
  if (!reason) return { error: 'A transfer needs a reason for the audit trail.' }

  const [from, to] = await Promise.all([
    prisma.budgetLine.findFirst({ where: { id: fromLineId, projectId }, include: { costCode: true, revisions: true } }),
    prisma.budgetLine.findFirst({ where: { id: toLineId, projectId }, include: { costCode: true } }),
  ])
  if (!from || !to) return { error: 'One of those cost codes is not on this project.' }

  const available = from.originalBudget + from.revisions.reduce((a, r) => a + r.amount, 0)
  if (amount > available) {
    return { error: `${from.costCode.code} only has ${available.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} of budget to give.` }
  }

  const transferGroup = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await prisma.$transaction([
    prisma.budgetRevision.create({
      data: {
        projectId,
        budgetLineId: fromLineId,
        type: 'TRANSFER',
        amount: -amount,
        reason: `Transfer to ${to.costCode.code}: ${reason}`,
        transferGroup,
        createdBy: user.id,
      },
    }),
    prisma.budgetRevision.create({
      data: {
        projectId,
        budgetLineId: toLineId,
        type: 'TRANSFER',
        amount,
        reason: `Transfer from ${from.costCode.code}: ${reason}`,
        transferGroup,
        createdBy: user.id,
      },
    }),
  ])

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'BudgetRevision',
    entityId: transferGroup,
    action: 'TRANSFER',
    summary: `Transferred ${amount} from ${from.costCode.code} to ${to.costCode.code} — ${reason}`,
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/** Posts a standalone budget revision to a single cost code. */
export async function reviseBudget(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:budget')

  const projectId = String(formData.get('projectId'))
  const budgetLineId = String(formData.get('budgetLineId'))
  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!isFinite(amount) || amount === 0) return { error: 'Enter a revision amount.' }
  if (!reason) return { error: 'A revision needs a reason for the audit trail.' }

  const line = await prisma.budgetLine.findFirst({
    where: { id: budgetLineId, projectId },
    include: { costCode: true },
  })
  if (!line) return { error: 'That cost code is not on this project.' }

  await prisma.budgetRevision.create({
    data: { projectId, budgetLineId, type: 'REVISION', amount, reason, createdBy: user.id },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'BudgetLine',
    entityId: budgetLineId,
    action: 'REVISE',
    summary: `Revised ${line.costCode.code} by ${amount} — ${reason}`,
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}
