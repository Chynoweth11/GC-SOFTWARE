'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { createLineIdentity } from '@/lib/line-identity'
import { COST_CATEGORIES, CATEGORY_LABELS } from '@/lib/finance/cost'
import type { CostCategory } from '@/generated/prisma/client'
import { recordAudit, recordFieldChanges } from '@/lib/audit'

/**
 * Moves budget between two line items.
 *
 * Recorded as two linked revisions rather than by editing the original budget,
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

  if (!fromLineId || !toLineId) return { error: 'Select both a source and a destination line item.' }
  if (fromLineId === toLineId) return { error: 'The source and destination line items must be different.' }
  if (!isFinite(amount) || amount <= 0) return { error: 'Enter a transfer amount greater than zero.' }
  if (!reason) return { error: 'A transfer needs a reason for the audit trail.' }

  const [from, to] = await Promise.all([
    prisma.budgetLine.findFirst({ where: { id: fromLineId, projectId }, include: { costCode: true, revisions: true } }),
    prisma.budgetLine.findFirst({ where: { id: toLineId, projectId }, include: { costCode: true } }),
  ])
  if (!from || !to) return { error: 'One of those line items is not on this project.' }

  const available = from.originalBudget + from.revisions.reduce((a, r) => a + r.amount, 0)
  if (amount > available) {
    return { error: `${from.description} only has ${available.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} of budget to give.` }
  }

  const transferGroup = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await prisma.$transaction([
    prisma.budgetRevision.create({
      data: {
        projectId,
        budgetLineId: fromLineId,
        type: 'TRANSFER',
        amount: -amount,
        reason: `Transfer to ${to.description}: ${reason}`,
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
        reason: `Transfer from ${from.description}: ${reason}`,
        transferGroup,
        createdBy: user.id,
      },
    }),
  ])

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'BudgetRevision',
    entityId: transferGroup,
    action: 'TRANSFER',
    summary: `Transferred ${amount} from ${from.description} to ${to.description}, ${reason}`,
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/** Posts a standalone budget revision to a single line item. */
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
  if (!line) return { error: 'That line item is not on this project.' }

  await prisma.budgetRevision.create({
    data: { projectId, budgetLineId, type: 'REVISION', amount, reason, createdBy: user.id },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'BudgetLine',
    entityId: budgetLineId,
    action: 'REVISE',
    summary: `Revised ${line.description} by ${amount}, ${reason}`,
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/**
 * Adds a line to the budget.
 *
 * A line is a cost type and a description. The opening amount becomes the
 * line's original budget, which every later revision and transfer is measured
 * against. No code is asked for: one is generated behind the scenes so the line
 * has a stable identity for cost, commitments and forecasts to point at.
 */
export async function addBudgetLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:budget')

  const projectId = String(formData.get('projectId') ?? '')
  const description = String(formData.get('description') ?? '').trim()
  const categoryInput = String(formData.get('category') ?? '')
  const tradeId = String(formData.get('tradeId') ?? '') || null
  const originalBudget = Number(formData.get('originalBudget'))
  const notes = String(formData.get('notes') ?? '').trim() || null

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'That project no longer exists.' }
  if (!description) return { error: 'Give the line a description.' }
  if (!COST_CATEGORIES.includes(categoryInput as CostCategory)) return { error: 'Choose a cost type.' }
  if (!isFinite(originalBudget) || originalBudget < 0) return { error: 'Enter a budget of zero or more.' }

  const category = categoryInput as CostCategory

  const duplicate = await prisma.budgetLine.findFirst({
    where: { projectId, description, category },
  })
  if (duplicate) {
    return { error: `This budget already has a ${CATEGORY_LABELS[category].toLowerCase()} line called ${description}.` }
  }

  const costCodeId = await createLineIdentity(user.companyId, category, description, tradeId)

  const line = await prisma.budgetLine.create({
    data: { projectId, costCodeId, description, category, tradeId, originalBudget, notes },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'BudgetLine',
    entityId: line.id,
    entityLabel: `${project.number} ${description}`,
    action: 'CREATE',
    field: 'Original budget',
    newValue: originalBudget,
    summary: `Added ${description} (${CATEGORY_LABELS[category]}) to the budget at ${originalBudget}`,
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/**
 * Changes a line's description, cost type or trade.
 *
 * The amounts are not touched here: money moves through a revision or a
 * transfer so the history stays continuous. This is for correcting what the
 * line is called and how it is classified.
 */
export async function updateBudgetLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:budget')

  const projectId = String(formData.get('projectId') ?? '')
  const budgetLineId = String(formData.get('budgetLineId') ?? '')
  const description = String(formData.get('description') ?? '').trim()
  const categoryInput = String(formData.get('category') ?? '')
  const tradeId = String(formData.get('tradeId') ?? '') || null

  if (!description) return { error: 'Give the line a description.' }
  if (!COST_CATEGORIES.includes(categoryInput as CostCategory)) return { error: 'Choose a cost type.' }

  const before = await prisma.budgetLine.findFirst({
    where: { id: budgetLineId, projectId, project: { companyId: user.companyId } },
    include: { project: { select: { number: true } } },
  })
  if (!before) return { error: 'That budget line no longer exists.' }

  const category = categoryInput as CostCategory
  const after = await prisma.budgetLine.update({
    where: { id: budgetLineId },
    data: { description, category, tradeId },
  })

  // The hidden identity carries the same wording, so an export of the raw data
  // still reads properly.
  await prisma.costCode.update({
    where: { id: before.costCodeId },
    data: { description, category, tradeId },
  })

  await recordFieldChanges({
    actor: user,
    entity: 'BudgetLine',
    entityId: budgetLineId,
    entityLabel: `${before.project.number} ${description}`,
    before: { description: before.description, category: before.category, tradeId: before.tradeId },
    after: { description: after.description, category: after.category, tradeId: after.tradeId },
    labels: { description: 'Description', category: 'Cost type', tradeId: 'Trade' },
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/**
 * Removes a budget line.
 *
 * Refused once anything has been booked against the code. A line carrying cost,
 * a commitment or a revision is part of the job's financial record, and taking
 * it out would leave those figures pointing at nothing. Revise it to zero
 * instead, which keeps the trail.
 */
export async function deleteBudgetLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:budget')
  assertCan(user.role, 'delete:records')

  const projectId = String(formData.get('projectId') ?? '')
  const budgetLineId = String(formData.get('budgetLineId') ?? '')

  const line = await prisma.budgetLine.findFirst({
    where: { id: budgetLineId, projectId, project: { companyId: user.companyId } },
    include: { costCode: true, project: { select: { number: true } }, revisions: true },
  })
  if (!line) return { error: 'That budget line no longer exists.' }

  const [costCount, commitmentCount] = await Promise.all([
    prisma.costTransaction.count({ where: { projectId, costCodeId: line.costCodeId, deletedAt: null } }),
    prisma.commitmentLine.count({ where: { costCodeId: line.costCodeId, commitment: { projectId } } }),
  ])

  const blockers: string[] = []
  if (costCount > 0) blockers.push(`${costCount} cost transaction${costCount === 1 ? '' : 's'}`)
  if (commitmentCount > 0) blockers.push(`${commitmentCount} commitment line${commitmentCount === 1 ? '' : 's'}`)
  if (line.revisions.length > 0) blockers.push(`${line.revisions.length} budget revision${line.revisions.length === 1 ? '' : 's'}`)

  if (blockers.length > 0) {
    return {
      error: `${line.description} carries ${blockers.join(', ')} and cannot be removed. Revise it to zero instead, which keeps the history.`,
    }
  }

  const label = `${line.project.number} ${line.description}`
  await prisma.budgetLine.delete({ where: { id: budgetLineId } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'BudgetLine',
    entityId: budgetLineId,
    entityLabel: label,
    action: 'DELETE',
    field: 'Original budget',
    oldValue: line.originalBudget,
    summary: `Removed ${line.description} from the budget; nothing had been booked against it`,
  })

  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}
