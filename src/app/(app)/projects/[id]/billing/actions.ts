'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Issues a pay application. Line amounts are this period's work only — the
 * certificate's cumulative figures are always derived from the full application
 * history, so a correction to an earlier application flows forward on its own.
 */
export async function createPayApplication(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:owner_billing')

  const projectId = String(formData.get('projectId'))
  const appNumber = Number(formData.get('appNumber'))
  const periodTo = parseDate(formData.get('periodTo'))

  if (!periodTo) return { error: 'Enter the period end date.' }

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'Project not found.' }

  const duplicate = await prisma.ownerBilling.findFirst({ where: { projectId, appNumber } })
  if (duplicate) return { error: `Application ${appNumber} already exists.` }

  const sovLines = await prisma.sovLine.findMany({ where: { projectId } })

  const lines = sovLines
    .map((s) => ({
      sovLineId: s.id,
      workThisPeriod: Number(formData.get(`work_${s.id}`)) || 0,
      storedMaterials: Number(formData.get(`stored_${s.id}`)) || 0,
    }))
    .filter((l) => l.workThisPeriod !== 0 || l.storedMaterials !== 0)

  if (lines.length === 0) return { error: 'Enter work completed on at least one schedule-of-values line.' }

  // Guard against billing a line past its scheduled value.
  const prior = await prisma.ownerBillingLine.findMany({
    where: { billing: { projectId, appNumber: { lt: appNumber } } },
  })
  const priorBySov = new Map<string, number>()
  for (const p of prior) {
    priorBySov.set(p.sovLineId, (priorBySov.get(p.sovLineId) ?? 0) + p.workThisPeriod + p.storedMaterials)
  }
  for (const line of lines) {
    const sov = sovLines.find((s) => s.id === line.sovLineId)!
    const cumulative = (priorBySov.get(line.sovLineId) ?? 0) + line.workThisPeriod + line.storedMaterials
    if (cumulative > sov.scheduledValue + 0.005) {
      return {
        error: `Line ${sov.number} (${sov.description}) would bill ${cumulative.toFixed(0)} against a scheduled value of ${sov.scheduledValue.toFixed(0)}.`,
      }
    }
  }

  const billing = await prisma.ownerBilling.create({
    data: {
      projectId,
      appNumber,
      periodTo,
      dateSubmitted: parseDate(formData.get('dateSubmitted')),
      retainagePct: Number(formData.get('retainagePct')) || project.ownerRetentionPct,
      status: parseDate(formData.get('dateSubmitted')) ? 'SUBMITTED' : 'DRAFT',
      notes: String(formData.get('notes') ?? '') || null,
      lines: { create: lines },
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'OwnerBilling',
    entityId: billing.id,
    action: 'CREATE',
    summary: `Issued pay application ${appNumber} for period ending ${periodTo.toISOString().slice(0, 10)}`,
  })

  revalidatePath(`/projects/${projectId}/billing`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

export async function recordPayment(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:owner_billing')

  const projectId = String(formData.get('projectId'))
  const appNumber = Number(formData.get('appNumber'))
  const amount = Number(formData.get('amount'))
  const datePaid = parseDate(formData.get('datePaid'))

  const billing = await prisma.ownerBilling.findFirst({
    where: { projectId, appNumber, project: { companyId: user.companyId } },
  })
  if (!billing || !isFinite(amount) || amount <= 0) return

  await prisma.ownerBilling.update({
    where: { id: billing.id },
    data: {
      amountPaid: billing.amountPaid + amount,
      datePaid: datePaid ?? new Date(),
      dateApproved: billing.dateApproved ?? datePaid ?? new Date(),
      status: 'PAID',
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'OwnerBilling',
    entityId: billing.id,
    action: 'PAYMENT',
    summary: `Recorded ${amount} collected against application ${appNumber}`,
  })

  revalidatePath(`/projects/${projectId}/billing`)
  revalidatePath(`/projects/${projectId}`)
}
