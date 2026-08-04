'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

/**
 * Records a period's production against a work item. Upserted on the period so
 * a correction replaces the entry rather than double-counting it.
 */
export async function recordProgress(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:costs')

  const projectId = String(formData.get('projectId'))
  const itemId = String(formData.get('itemId'))
  const periodRaw = String(formData.get('periodEnd'))
  const installedQty = Number(formData.get('installedQty'))
  const actualHours = Number(formData.get('actualHours'))
  const crewDays = Number(formData.get('crewDays'))

  if (!itemId) return { error: 'Choose a work item.' }
  if (!periodRaw) return { error: 'Enter the period end date.' }
  if (!isFinite(installedQty) || installedQty < 0) return { error: 'Installed quantity cannot be negative.' }
  if (!isFinite(actualHours) || actualHours < 0) return { error: 'Hours cannot be negative.' }

  const periodEnd = new Date(`${periodRaw}T00:00:00.000Z`)

  const item = await prisma.quantityItem.findFirst({
    where: { id: itemId, projectId, project: { companyId: user.companyId } },
    include: { entries: true },
  })
  if (!item) return { error: 'Work item not found on this project.' }

  const otherPeriods = item.entries.filter((e) => e.periodEnd.getTime() !== periodEnd.getTime())
  const cumulative = otherPeriods.reduce((a, e) => a + e.installedQty, 0) + installedQty
  if (item.budgetQty > 0 && cumulative > item.budgetQty * 1.25) {
    return {
      error: `That would put installed quantity at ${cumulative.toFixed(0)} against a budget of ${item.budgetQty.toFixed(0)}. Revise the budget quantity first if the scope really grew.`,
    }
  }

  await prisma.quantityEntry.upsert({
    where: { itemId_periodEnd: { itemId, periodEnd } },
    create: {
      itemId,
      periodEnd,
      installedQty,
      actualHours,
      crewDays: isFinite(crewDays) ? crewDays : 0,
      notes: String(formData.get('notes') ?? '') || null,
    },
    update: {
      installedQty,
      actualHours,
      crewDays: isFinite(crewDays) ? crewDays : 0,
      notes: String(formData.get('notes') ?? '') || null,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'QuantityEntry',
    entityId: `${itemId}:${periodRaw}`,
    action: 'RECORD',
    summary: `${item.description}: ${installedQty} ${item.uom} in ${actualHours} hours for period ending ${periodRaw}`,
  })

  revalidatePath(`/projects/${projectId}/quantities`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}
