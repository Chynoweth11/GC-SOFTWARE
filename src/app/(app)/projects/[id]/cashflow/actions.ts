'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { defaultCurve } from '@/lib/finance'

export async function saveCashFlowPeriod(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:forecast')

  const projectId = String(formData.get('projectId'))
  const periodEndRaw = String(formData.get('periodEnd'))
  const periodEnd = new Date(periodEndRaw)
  if (isNaN(periodEnd.getTime())) return { error: 'Invalid period.' }

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'Project not found.' }

  const plannedDeltaPct = Number(formData.get('plannedDeltaPct'))
  if (!isFinite(plannedDeltaPct) || plannedDeltaPct < 0 || plannedDeltaPct > 1) {
    return { error: 'Planned progress for a month must be between 0 and 1.' }
  }

  const billingRaw = String(formData.get('billingOverride') ?? '')
  const collectionRaw = String(formData.get('collectionOverride') ?? '')

  await prisma.cashFlowPeriod.upsert({
    where: { projectId_periodEnd: { projectId, periodEnd } },
    create: {
      projectId,
      periodEnd,
      plannedDeltaPct,
      billingOverride: billingRaw === '' ? null : Number(billingRaw),
      collectionOverride: collectionRaw === '' ? null : Number(collectionRaw),
      notes: String(formData.get('notes') ?? '') || null,
    },
    update: {
      plannedDeltaPct,
      billingOverride: billingRaw === '' ? null : Number(billingRaw),
      collectionOverride: collectionRaw === '' ? null : Number(collectionRaw),
      notes: String(formData.get('notes') ?? '') || null,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'CashFlowPeriod',
    entityId: `${projectId}:${periodEnd.toISOString().slice(0, 10)}`,
    action: 'SAVE',
    summary: `Cash-flow month ${periodEnd.toISOString().slice(0, 10)} updated`,
  })

  revalidatePath(`/projects/${projectId}/cashflow`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/**
 * Rebuilds the planned curve from the contract dates, preserving any actuals
 * already recorded — a reset of the plan, not of the history.
 */
export async function regenerateCurve(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:forecast')

  const projectId = String(formData.get('projectId'))
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return

  const start = project.contractStart ?? project.noticeToProceed
  const finish = project.forecastCompletion ?? project.contractCompletion
  if (!start || !finish) return

  const existing = await prisma.cashFlowPeriod.findMany({ where: { projectId } })
  const actualsByMonth = new Map(existing.map((p) => [p.periodEnd.toISOString().slice(0, 7), p]))

  const curve = defaultCurve(start, finish)

  await prisma.$transaction([
    prisma.cashFlowPeriod.deleteMany({ where: { projectId } }),
    ...curve.map((p) => {
      const prior = actualsByMonth.get(p.periodEnd.toISOString().slice(0, 7))
      return prisma.cashFlowPeriod.create({
        data: {
          projectId,
          periodEnd: p.periodEnd,
          plannedDeltaPct: p.plannedDeltaPct,
          actualPctComplete: prior?.actualPctComplete ?? null,
          actualCost: prior?.actualCost ?? null,
          billingOverride: prior?.billingOverride ?? null,
          collectionOverride: prior?.collectionOverride ?? null,
          notes: prior?.notes ?? null,
        },
      })
    }),
  ])

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'Project',
    entityId: projectId,
    action: 'REBUILD_CURVE',
    summary: `Rebuilt the planned progress curve across ${curve.length} months; recorded actuals preserved`,
  })

  revalidatePath(`/projects/${projectId}/cashflow`)
  revalidatePath(`/projects/${projectId}`)
}
