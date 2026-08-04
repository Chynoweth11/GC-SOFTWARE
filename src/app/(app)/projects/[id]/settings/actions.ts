'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { getProjectBundle } from '@/lib/queries/project'
import type { ProjectStatus } from '@/generated/prisma/client'

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

function num(value: FormDataEntryValue | null, fallback = 0): number {
  const parsed = Number(value)
  return isFinite(parsed) ? parsed : fallback
}

/**
 * Updates project setup, writing an audit entry for every field that actually
 * changed rather than one blanket "updated" record.
 */
export async function updateProject(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')

  const projectId = String(formData.get('projectId'))
  const existing = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!existing) return { error: 'Project not found.' }

  const number = String(formData.get('number') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!number) return { error: 'Job number is required.' }
  if (!name) return { error: 'Project name is required.' }

  if (number !== existing.number) {
    const clash = await prisma.project.findFirst({ where: { companyId: user.companyId, number } })
    if (clash) return { error: `Job number ${number} is already in use.` }
  }

  const contractStart = parseDate(formData.get('contractStart'))
  const contractCompletion = parseDate(formData.get('contractCompletion'))
  if (contractStart && contractCompletion && contractCompletion < contractStart) {
    return { error: 'Contract completion cannot be before the contract start.' }
  }

  const data = {
    number,
    name,
    clientId: String(formData.get('clientId') ?? '') || null,
    address: String(formData.get('address') ?? '') || null,
    city: String(formData.get('city') ?? '') || null,
    state: String(formData.get('state') ?? '') || null,
    projectType: String(formData.get('projectType') ?? '') || null,
    deliveryMethod: String(formData.get('deliveryMethod') ?? '') || null,
    architect: String(formData.get('architect') ?? '') || null,
    pmUserId: String(formData.get('pmUserId') ?? '') || null,
    superintendent: String(formData.get('superintendent') ?? '') || null,
    status: String(formData.get('status') ?? existing.status) as ProjectStatus,
    noticeToProceed: parseDate(formData.get('noticeToProceed')),
    contractStart,
    contractCompletion,
    forecastCompletion: parseDate(formData.get('forecastCompletion')),
    dataDate: parseDate(formData.get('dataDate')),
    originalContractSum: num(formData.get('originalContractSum')),
    ownerRetentionPct: num(formData.get('ownerRetentionPct')),
    defaultSubRetentionPct: num(formData.get('defaultSubRetentionPct')),
    targetMarginPct: num(formData.get('targetMarginPct')),
    laborBurdenPct: num(formData.get('laborBurdenPct')),
    overheadPct: num(formData.get('overheadPct')),
    workDaysPerWeek: Math.max(1, Math.min(7, Math.round(num(formData.get('workDaysPerWeek'), 5)))),
    safetyScore: formData.get('safetyScore') ? num(formData.get('safetyScore')) : null,
    qualityScore: formData.get('qualityScore') ? num(formData.get('qualityScore')) : null,
    clientSatScore: formData.get('clientSatScore') ? num(formData.get('clientSatScore')) : null,
    notes: String(formData.get('notes') ?? '') || null,
  }

  await prisma.project.update({ where: { id: projectId }, data })

  // Audit only the fields that moved.
  const tracked: (keyof typeof data)[] = [
    'number', 'name', 'status', 'originalContractSum', 'ownerRetentionPct',
    'targetMarginPct', 'contractCompletion', 'forecastCompletion', 'dataDate',
  ]
  for (const field of tracked) {
    const before = existing[field as keyof typeof existing]
    const after = data[field]
    const beforeText = before instanceof Date ? before.toISOString().slice(0, 10) : String(before ?? '')
    const afterText = after instanceof Date ? after.toISOString().slice(0, 10) : String(after ?? '')
    if (beforeText !== afterText) {
      await recordAudit({
        companyId: user.companyId,
        userId: user.id,
        actor: user,
        entity: 'Project',
        entityId: projectId,
        action: 'UPDATE',
        field: String(field),
        oldValue: beforeText,
        newValue: afterText,
        summary: `${String(field)} changed from ${beforeText || '-'} to ${afterText || '-'}`,
      })
    }
  }

  revalidatePath(`/projects/${projectId}`, 'layout')
  revalidatePath('/')
  return {}
}

/** Captures the current financial position as an immutable snapshot. */
export async function createSnapshot(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')

  const projectId = String(formData.get('projectId'))
  const bundle = await getProjectBundle(projectId, user.companyId)
  if (!bundle) return

  const asOf = bundle.project.dataDate ?? new Date()

  await prisma.projectSnapshot.upsert({
    where: { projectId_asOf: { projectId, asOf } },
    create: {
      projectId,
      asOf,
      label: `Manual capture, ${asOf.toISOString().slice(0, 10)}`,
      payload: JSON.stringify(bundle.financials),
      createdBy: user.id,
    },
    update: { payload: JSON.stringify(bundle.financials), createdBy: user.id },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ProjectSnapshot',
    entityId: projectId,
    action: 'SNAPSHOT',
    summary: `Captured the financial position as of ${asOf.toISOString().slice(0, 10)}`,
  })

  revalidatePath(`/projects/${projectId}/settings`)
}

/**
 * Archives a project, or brings one back.
 *
 * Closing a job is a status change, not a deletion: the contract, the costs and
 * the pay applications all stay exactly where they are and keep reporting.
 */
export async function setProjectArchived(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')

  const projectId = String(formData.get('projectId') ?? '')
  const archived = formData.get('archived') === 'true'

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'That project no longer exists.' }

  const status = archived ? 'CLOSED' : 'ACTIVE'
  await prisma.project.update({ where: { id: projectId }, data: { status } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Project',
    entityId: projectId,
    entityLabel: `${project.number} ${project.name}`,
    action: archived ? 'ARCHIVE' : 'RESTORE',
    field: 'Status',
    oldValue: project.status,
    newValue: status,
    summary: archived
      ? `Closed ${project.number}. Its financial history stays on record.`
      : `Reopened ${project.number}`,
  })

  revalidatePath(`/projects/${projectId}/settings`)
  revalidatePath('/projects')
  return {}
}

/**
 * Deletes a project outright.
 *
 * Refused as soon as the job carries financial history. A project with costs,
 * billings or commitments against it is part of the company's books, and the
 * honest way to retire it is to close it. Deleting is for the job that was
 * created by mistake ten minutes ago.
 */
export async function deleteProject(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')
  assertCan(user.role, 'delete:records')

  const projectId = String(formData.get('projectId') ?? '')
  const confirmation = String(formData.get('confirmation') ?? '').trim()

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    include: {
      _count: {
        select: { costTx: true, ownerBillings: true, commitments: true, changeOrders: true, subInvoices: true },
      },
    },
  })
  if (!project) return { error: 'That project no longer exists.' }

  if (confirmation !== project.number) {
    return { error: `Type the job number ${project.number} to confirm.` }
  }

  const counts = project._count
  const history: string[] = []
  if (counts.costTx > 0) history.push(`${counts.costTx} cost transactions`)
  if (counts.ownerBillings > 0) history.push(`${counts.ownerBillings} pay applications`)
  if (counts.commitments > 0) history.push(`${counts.commitments} commitments`)
  if (counts.changeOrders > 0) history.push(`${counts.changeOrders} change orders`)
  if (counts.subInvoices > 0) history.push(`${counts.subInvoices} subcontractor invoices`)

  if (history.length > 0) {
    return {
      error: `${project.number} carries ${history.join(', ')} and cannot be deleted. Close the project instead, which keeps every figure on record.`,
    }
  }

  const label = `${project.number} ${project.name}`
  await prisma.project.delete({ where: { id: projectId } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Project',
    entityId: projectId,
    entityLabel: label,
    action: 'DELETE',
    oldValue: label,
    summary: `Deleted ${label}, which had no cost, billing or commitment history`,
  })

  revalidatePath('/projects')
  revalidatePath('/')
  return {}
}
