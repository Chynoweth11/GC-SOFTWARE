'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { ChangeOrderStatus, ChangeOrderType } from '@/generated/prisma/client'

const APPROVED: ChangeOrderStatus[] = ['APPROVED', 'EXECUTED']

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Posts (or removes) the budget revision that an approved change order implies.
 *
 * Keeping this in one place is what makes "enter it once" true: approving a
 * change order raises the budget, un-approving it reverses that raise, and the
 * budget's revision history records both movements.
 */
async function syncBudgetForChangeOrder(changeOrderId: string, userId: string, companyId: string) {
  const co = await prisma.changeOrder.findUniqueOrThrow({
    where: { id: changeOrderId },
    include: { lines: { include: { costCode: true } } },
  })

  const existing = await prisma.budgetRevision.findMany({ where: { changeOrderId } })
  const shouldPost = APPROVED.includes(co.status) && co.postsToBudget

  if (!shouldPost) {
    if (existing.length > 0) {
      await prisma.budgetRevision.deleteMany({ where: { changeOrderId } })
      await recordAudit({
        companyId,
        userId,
        entity: 'ChangeOrder',
        entityId: changeOrderId,
        action: 'BUDGET_REVERSED',
        summary: `Reversed the budget impact of ${co.number} — it is no longer approved`,
      })
    }
    return
  }

  if (existing.length > 0) return // already posted

  // Lines carry the breakdown; without them the whole cost impact lands on the
  // cost code the change order is tagged to, or is skipped if there isn't one.
  const allocations =
    co.lines.length > 0
      ? co.lines.map((l) => ({ costCodeId: l.costCodeId, amount: l.amount }))
      : []

  for (const allocation of allocations) {
    const budgetLine = await prisma.budgetLine.findFirst({
      where: { projectId: co.projectId, costCodeId: allocation.costCodeId },
    })
    if (!budgetLine) continue
    await prisma.budgetRevision.create({
      data: {
        projectId: co.projectId,
        budgetLineId: budgetLine.id,
        type: 'CHANGE_ORDER',
        amount: allocation.amount,
        reason: `${co.number} approved — ${co.description}`,
        changeOrderId,
        createdBy: userId,
      },
    })
  }
}

export async function createChangeOrder(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const projectId = String(formData.get('projectId'))
  const number = String(formData.get('number') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const ownerAmount = Number(formData.get('ownerAmount'))
  const costAmount = Number(formData.get('costAmount'))
  const costCodeId = String(formData.get('costCodeId') ?? '')

  if (!number) return { error: 'Enter a change-order number.' }
  if (!description) return { error: 'Describe the change.' }
  if (!isFinite(ownerAmount)) return { error: 'Enter the owner amount.' }
  if (!isFinite(costAmount)) return { error: 'Enter the cost amount.' }

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'Project not found.' }

  const duplicate = await prisma.changeOrder.findFirst({ where: { projectId, number } })
  if (duplicate) return { error: `Change order ${number} already exists on this project.` }

  const status = String(formData.get('status') ?? 'DRAFT') as ChangeOrderStatus

  const co = await prisma.changeOrder.create({
    data: {
      projectId,
      number,
      type: String(formData.get('type') ?? 'OWNER_REQUEST') as ChangeOrderType,
      description,
      origin: String(formData.get('origin') ?? '') || null,
      tradeId: String(formData.get('tradeId') ?? '') || null,
      status,
      dateInitiated: parseDate(formData.get('dateInitiated')) ?? new Date(),
      dateSubmitted: parseDate(formData.get('dateSubmitted')),
      dateApproved: APPROVED.includes(status) ? (parseDate(formData.get('dateApproved')) ?? new Date()) : null,
      anticipatedApproval: parseDate(formData.get('anticipatedApproval')),
      ownerAmount,
      costAmount,
      submittedAmount: ownerAmount,
      approvedAmount: APPROVED.includes(status) ? ownerAmount : 0,
      probabilityPct: Number(formData.get('probabilityPct')) || 0,
      scheduleImpactDays: Number(formData.get('scheduleImpactDays')) || 0,
      notes: String(formData.get('notes') ?? '') || null,
      lines: costCodeId
        ? {
            create: [
              {
                costCodeId,
                category: 'OTHER',
                description,
                quantity: 1,
                unitCost: costAmount,
                amount: costAmount,
              },
            ],
          }
        : undefined,
    },
  })

  await syncBudgetForChangeOrder(co.id, user.id, user.companyId)

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'ChangeOrder',
    entityId: co.id,
    action: 'CREATE',
    summary: `Raised ${number} for ${ownerAmount} (cost ${costAmount}) — ${description}`,
  })

  revalidatePath(`/projects/${projectId}/changes`)
  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

export async function updateChangeOrderStatus(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const changeOrderId = String(formData.get('changeOrderId'))
  const status = String(formData.get('status')) as ChangeOrderStatus

  const existing = await prisma.changeOrder.findFirst({
    where: { id: changeOrderId, project: { companyId: user.companyId } },
  })
  if (!existing || existing.status === status) return

  await prisma.changeOrder.update({
    where: { id: changeOrderId },
    data: {
      status,
      dateApproved: APPROVED.includes(status) ? (existing.dateApproved ?? new Date()) : null,
      approvedAmount: APPROVED.includes(status) ? existing.ownerAmount : 0,
      rejectedAmount: status === 'REJECTED' ? existing.ownerAmount : 0,
      probabilityPct: APPROVED.includes(status) ? 1 : existing.probabilityPct,
    },
  })

  await syncBudgetForChangeOrder(changeOrderId, user.id, user.companyId)

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'ChangeOrder',
    entityId: changeOrderId,
    action: 'STATUS',
    field: 'status',
    oldValue: existing.status,
    newValue: status,
    summary: `${existing.number} moved from ${existing.status} to ${status}`,
  })

  revalidatePath(`/projects/${existing.projectId}/changes`)
  revalidatePath(`/projects/${existing.projectId}/budget`)
  revalidatePath(`/projects/${existing.projectId}`)
}

export async function setPendingInclusion(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const projectId = String(formData.get('projectId'))
  const value = Math.max(0, Math.min(1, Number(formData.get('pendingCoInclusionPct')) || 0))

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return

  await prisma.project.update({ where: { id: projectId }, data: { pendingCoInclusionPct: value } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'Project',
    entityId: projectId,
    action: 'UPDATE',
    field: 'pendingCoInclusionPct',
    oldValue: project.pendingCoInclusionPct,
    newValue: value,
    summary: `Pending change-order inclusion set to ${(value * 100).toFixed(0)}%`,
  })

  revalidatePath(`/projects/${projectId}/changes`)
  revalidatePath(`/projects/${projectId}`)
}
