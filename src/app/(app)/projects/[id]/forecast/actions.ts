'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { getProjectBundle } from '@/lib/queries/project'
import type { EacMethod, RiskLevel } from '@/generated/prisma/client'

/**
 * Saves one forecast line. Percent complete and an optional estimate to complete
 * are the only inputs; the engine derives everything else, so the stored figures
 * and the displayed figures can never disagree.
 */
export async function saveForecastLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:forecast')

  const projectId = String(formData.get('projectId'))
  const periodId = String(formData.get('periodId'))
  const costCodeId = String(formData.get('costCodeId'))
  const pctComplete = Number(formData.get('pctComplete'))
  const etcRaw = String(formData.get('etcOverride') ?? '')
  const note = String(formData.get('note') ?? '').trim() || null
  const riskLevel = String(formData.get('riskLevel') ?? 'LOW') as RiskLevel
  const confidence = Number(formData.get('confidence'))

  if (!isFinite(pctComplete) || pctComplete < 0 || pctComplete > 1) {
    return { error: 'Percent complete must be between 0 and 1.' }
  }

  const period = await prisma.forecastPeriod.findFirst({
    where: { id: periodId, projectId, project: { companyId: user.companyId } },
  })
  if (!period) return { error: 'Forecast period not found.' }
  if (period.status === 'LOCKED') return { error: 'This period is locked. Reopen it before editing.' }

  const budgetLine = await prisma.budgetLine.findFirst({
    where: { projectId, costCodeId },
    include: { revisions: true },
  })
  if (!budgetLine) return { error: 'That cost code has no budget on this project.' }

  const currentBudget = budgetLine.originalBudget + budgetLine.revisions.reduce((a, r) => a + r.amount, 0)
  const costTx = await prisma.costTransaction.findMany({ where: { projectId, costCodeId, deletedAt: null } })
  const costToDate = costTx.reduce((a, t) => a + t.amount, 0)
  const accrued = costTx.filter((t) => t.type === 'ACCRUAL').reduce((a, t) => a + t.amount, 0)

  const etcOverride = etcRaw === '' ? null : Number(etcRaw)
  if (etcOverride != null && (!isFinite(etcOverride) || etcOverride < 0)) {
    return { error: 'Estimate to complete cannot be negative.' }
  }

  const estimateToComplete = etcOverride ?? (pctComplete >= 1 ? 0 : currentBudget * (1 - pctComplete))
  const estimateAtCompletion = costToDate + estimateToComplete

  const existing = await prisma.forecastLine.findUnique({
    where: { periodId_costCodeId: { periodId, costCodeId } },
  })

  // A material movement must carry an explanation.
  const previous = existing?.estimateAtCompletion ?? 0
  if (previous > 0 && Math.abs(estimateAtCompletion - previous) > 5_000 && !note) {
    return { error: 'A movement over $5,000 needs a written explanation before it can be saved.' }
  }

  await prisma.forecastLine.upsert({
    where: { periodId_costCodeId: { periodId, costCodeId } },
    create: {
      periodId,
      costCodeId,
      currentBudget,
      costToDate,
      accrued,
      pctComplete,
      etcOverride,
      estimateToComplete,
      estimateAtCompletion,
      previousEac: previous,
      riskLevel,
      confidence: isFinite(confidence) ? confidence : 0.8,
      note,
    },
    update: {
      currentBudget,
      costToDate,
      accrued,
      pctComplete,
      etcOverride,
      estimateToComplete,
      estimateAtCompletion,
      riskLevel,
      confidence: isFinite(confidence) ? confidence : 0.8,
      note,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ForecastLine',
    entityId: `${periodId}:${costCodeId}`,
    action: 'SAVE',
    oldValue: previous,
    newValue: estimateAtCompletion,
    summary: note ?? `Forecast updated to ${estimateAtCompletion.toFixed(0)}`,
  })

  revalidatePath(`/projects/${projectId}/forecast`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/**
 * Locks a period and captures a snapshot of the whole project position, so the
 * month-end close is a permanent record rather than a moving figure.
 */
export async function lockForecastPeriod(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'lock:forecast')

  const periodId = String(formData.get('periodId'))
  const projectId = String(formData.get('projectId'))

  const period = await prisma.forecastPeriod.findFirst({
    where: { id: periodId, projectId, project: { companyId: user.companyId } },
  })
  if (!period || period.status === 'LOCKED') return

  await prisma.forecastPeriod.update({
    where: { id: periodId },
    data: { status: 'LOCKED', lockedAt: new Date(), lockedBy: user.id },
  })

  const bundle = await getProjectBundle(projectId, user.companyId)
  if (bundle) {
    await prisma.projectSnapshot.upsert({
      where: { projectId_asOf: { projectId, asOf: period.periodEnd } },
      create: {
        projectId,
        asOf: period.periodEnd,
        label: `Forecast lock, ${period.periodEnd.toISOString().slice(0, 10)}`,
        payload: JSON.stringify(bundle.financials),
        createdBy: user.id,
      },
      update: {
        payload: JSON.stringify(bundle.financials),
        createdBy: user.id,
      },
    })
  }

  // Open the next month so the following close has somewhere to go.
  const next = new Date(Date.UTC(period.periodEnd.getUTCFullYear(), period.periodEnd.getUTCMonth() + 2, 0))
  await prisma.forecastPeriod.upsert({
    where: { projectId_periodEnd: { projectId, periodEnd: next } },
    create: { projectId, periodEnd: next, status: 'OPEN' },
    update: {},
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ForecastPeriod',
    entityId: periodId,
    action: 'LOCK',
    summary: `Locked the forecast for ${period.periodEnd.toISOString().slice(0, 10)} and captured a snapshot`,
  })

  revalidatePath(`/projects/${projectId}/forecast`)
  revalidatePath(`/projects/${projectId}`)
}

export async function openForecastPeriod(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'lock:forecast')

  const periodId = String(formData.get('periodId'))
  const projectId = String(formData.get('projectId'))

  const period = await prisma.forecastPeriod.findFirst({
    where: { id: periodId, projectId, project: { companyId: user.companyId } },
  })
  if (!period) return

  await prisma.forecastPeriod.update({ where: { id: periodId }, data: { status: 'OPEN', lockedAt: null } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ForecastPeriod',
    entityId: periodId,
    action: 'REOPEN',
    summary: `Reopened the forecast for ${period.periodEnd.toISOString().slice(0, 10)}. The snapshot taken at lock is retained.`,
  })

  revalidatePath(`/projects/${projectId}/forecast`)
}

export async function setEacMethod(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:forecast')

  const projectId = String(formData.get('projectId'))
  const eacMethod = String(formData.get('eacMethod')) as EacMethod

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return

  await prisma.project.update({ where: { id: projectId }, data: { eacMethod } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Project',
    entityId: projectId,
    action: 'UPDATE',
    field: 'eacMethod',
    oldValue: project.eacMethod,
    newValue: eacMethod,
    summary: `Estimate-at-completion method changed to ${eacMethod}`,
  })

  revalidatePath(`/projects/${projectId}/forecast`)
  revalidatePath(`/projects/${projectId}`)
}
