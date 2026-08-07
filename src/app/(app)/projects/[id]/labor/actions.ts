'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'
import type { AssignmentBasis, ComplianceFrequency, ComplianceKind } from '@/generated/prisma/client'

/**
 * Who is on this job, and what this job has to file.
 *
 * No cost is stored on an assignment. The classification's loaded rate, the
 * dates and the share are stored, and the money is worked out on the way to the
 * screen, so a pay rise reprices every job that person is on.
 *
 * No deadline is stored on a requirement beyond the first one. The rest of the
 * schedule is counted forward from it, so a late filing cannot quietly shift
 * everything that follows.
 */

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function number(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/[$,%\s]/g, ''))
  return isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').replace(/[$,%\s]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  return isFinite(parsed) ? parsed : null
}

function day(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null
}

async function ownedProject(projectId: string, companyId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true, number: true, name: true },
  })
}

// ── Project team and labor ────────────────────────────────────────────────

const ASSIGNMENT_LABELS: Record<string, string> = {
  classificationId: 'classification',
  label: 'person',
  costCodeId: 'cost code',
  basis: 'basis',
  budgetedHours: 'budgeted hours',
  allocationPct: 'allocation',
  startDate: 'start date',
  endDate: 'end date',
  loadedRateOverride: 'rate for this job',
  notes: 'notes',
}

function assignmentFields(row: {
  classificationId: string
  label: string | null
  costCodeId: string | null
  basis: string
  budgetedHours: number
  allocationPct: number
  startDate: Date | null
  endDate: Date | null
  loadedRateOverride: number | null
  notes: string | null
}) {
  return {
    classificationId: row.classificationId,
    label: row.label,
    costCodeId: row.costCodeId,
    basis: row.basis,
    budgetedHours: row.budgetedHours,
    allocationPct: row.allocationPct,
    startDate: row.startDate,
    endDate: row.endDate,
    loadedRateOverride: row.loadedRateOverride,
    notes: row.notes,
  }
}

export async function saveLaborAssignment(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = text(formData.get('id'))
  const projectId = String(formData.get('projectId'))
  const classificationId = text(formData.get('classificationId'))
  const basis = String(formData.get('basis') ?? 'ALLOCATION')

  if (!classificationId) return { error: 'Choose the classification this assignment is for.' }
  if (basis !== 'HOURS' && basis !== 'ALLOCATION') return { error: 'Choose how this assignment is measured.' }

  const project = await ownedProject(projectId, user.companyId)
  if (!project) return { error: 'That project is not on this account.' }

  const classification = await prisma.laborClassification.findFirst({
    where: { id: classificationId, companyId: user.companyId },
    select: { id: true, name: true },
  })
  if (!classification) return { error: 'That classification is not on this account.' }

  const costCodeId = text(formData.get('costCodeId'))
  if (costCodeId) {
    const costCode = await prisma.costCode.findFirst({
      where: { id: costCodeId, companyId: user.companyId },
      select: { id: true },
    })
    if (!costCode) return { error: 'That cost code is not on this account.' }
  }

  const budgetedHours = number(formData.get('budgetedHours'))
  // Entered as a percentage, stored as a fraction, converted once here.
  const allocationPct = number(formData.get('allocationPct')) / 100
  const startDate = day(formData.get('startDate'))
  const endDate = day(formData.get('endDate'))

  if (basis === 'HOURS' && budgetedHours <= 0) {
    return { error: 'Enter the hours this assignment carries.' }
  }
  if (basis === 'ALLOCATION') {
    if (!startDate || !endDate) return { error: 'An allocation needs a start and an end date.' }
    if (endDate.getTime() < startDate.getTime()) return { error: 'The end date is before the start date.' }
    if (allocationPct <= 0) return { error: 'Enter the share of their time as a percentage above zero.' }
    if (allocationPct > 2) return { error: 'An allocation above 200 percent of one person is not something to record silently.' }
  }

  const data = {
    classificationId,
    label: text(formData.get('label')),
    costCodeId: costCodeId ?? null,
    basis: basis as AssignmentBasis,
    budgetedHours: basis === 'HOURS' ? budgetedHours : 0,
    allocationPct: basis === 'ALLOCATION' ? allocationPct : 1,
    startDate: basis === 'ALLOCATION' ? startDate : null,
    endDate: basis === 'ALLOCATION' ? endDate : null,
    loadedRateOverride: optionalNumber(formData.get('loadedRateOverride')),
    notes: text(formData.get('notes')),
  } as const

  const who = data.label ?? classification.name

  if (id) {
    const existing = await prisma.projectLaborAssignment.findFirst({ where: { id, projectId } })
    if (!existing) return { error: 'That assignment is not on this project.' }

    const updated = await prisma.projectLaborAssignment.update({ where: { id }, data })
    await recordFieldChanges({
      actor: user,
      entity: 'ProjectLaborAssignment',
      entityId: id,
      entityLabel: `${project.number} ${who}`,
      before: assignmentFields(existing),
      after: assignmentFields(updated),
      labels: ASSIGNMENT_LABELS,
    })
  } else {
    const last = await prisma.projectLaborAssignment.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.projectLaborAssignment.create({
      data: { ...data, projectId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'ProjectLaborAssignment',
      entityId: created.id,
      entityLabel: `${project.number} ${who}`,
      action: 'CREATE',
      summary:
        basis === 'ALLOCATION'
          ? `${who} assigned at ${(allocationPct * 100).toFixed(0)} percent from ${startDate?.toISOString().slice(0, 10)} to ${endDate?.toISOString().slice(0, 10)}`
          : `${who} assigned for ${budgetedHours} hours`,
    })
  }

  revalidatePath(`/projects/${projectId}/labor`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

export async function deleteLaborAssignment(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = String(formData.get('id'))
  const assignment = await prisma.projectLaborAssignment.findFirst({
    where: { id, project: { companyId: user.companyId } },
    include: { project: { select: { id: true, number: true } }, classification: { select: { name: true } } },
  })
  if (!assignment) return { error: 'That assignment is not on this account.' }

  await prisma.projectLaborAssignment.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ProjectLaborAssignment',
    entityId: id,
    entityLabel: `${assignment.project.number} ${assignment.label ?? assignment.classification.name}`,
    action: 'DELETE',
    summary: `${assignment.label ?? assignment.classification.name} taken off ${assignment.project.number}`,
  })

  revalidatePath(`/projects/${assignment.projectId}/labor`)
  return {}
}

// ── Compliance ────────────────────────────────────────────────────────────

const REQUIREMENT_LABELS: Record<string, string> = {
  kind: 'requirement type',
  title: 'title',
  agency: 'agency',
  frequency: 'how often',
  firstDueDate: 'first due date',
  endsOn: 'ends on',
  leadDays: 'warning lead time',
  responsibleUserId: 'responsible person',
  notes: 'notes',
  active: 'still required',
}

const FREQUENCIES = new Set<string>([
  'WEEKLY',
  'BIWEEKLY',
  'SEMIMONTHLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'ONE_TIME',
] satisfies ComplianceFrequency[])

const KINDS = new Set<string>([
  'CERTIFIED_PAYROLL',
  'PREVAILING_WAGE_POSTING',
  'FRINGE_BENEFIT_STATEMENT',
  'APPRENTICESHIP_UTILIZATION',
  'EEO_REPORT',
  'WAGE_DETERMINATION_UPDATE',
  'INTENT_OR_AFFIDAVIT',
  'OSHA_LOG',
  'INSURANCE_CERTIFICATE',
  'LICENSE_OR_REGISTRATION',
  'OTHER',
] satisfies ComplianceKind[])

export async function saveComplianceRequirement(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = text(formData.get('id'))
  const projectId = String(formData.get('projectId'))
  const title = text(formData.get('title'))
  const kind = String(formData.get('kind') ?? 'CERTIFIED_PAYROLL')
  const frequency = String(formData.get('frequency') ?? 'WEEKLY')
  const firstDueDate = day(formData.get('firstDueDate'))
  const endsOn = day(formData.get('endsOn'))
  const leadDays = Math.round(number(formData.get('leadDays')))

  if (!title) return { error: 'Give the requirement a title, for example "Certified payroll".' }
  if (!KINDS.has(kind)) return { error: 'Choose what kind of requirement this is.' }
  if (!FREQUENCIES.has(frequency)) return { error: 'Choose how often it is due.' }
  if (!firstDueDate) return { error: 'Enter the first deadline. Every later one is counted forward from it.' }
  if (endsOn && endsOn.getTime() < firstDueDate.getTime()) {
    return { error: 'The end date is before the first deadline.' }
  }
  if (leadDays < 0 || leadDays > 90) return { error: 'The warning lead time is a number of days between 0 and 90.' }

  const project = await ownedProject(projectId, user.companyId)
  if (!project) return { error: 'That project is not on this account.' }

  const responsibleUserId = text(formData.get('responsibleUserId'))
  if (responsibleUserId) {
    const responsible = await prisma.user.findFirst({
      where: { id: responsibleUserId, companyId: user.companyId },
      select: { id: true },
    })
    if (!responsible) return { error: 'That person is not on this account.' }
  }

  const clash = await prisma.complianceRequirement.findFirst({
    where: { projectId, title, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `This project already has a requirement called "${title}".` }

  // Checked against the sets above, so the narrowing here is the validation
  // already done rather than a claim about unchecked input.
  const data = {
    kind: kind as ComplianceKind,
    title,
    agency: text(formData.get('agency')),
    frequency: frequency as ComplianceFrequency,
    firstDueDate,
    endsOn,
    leadDays,
    responsibleUserId: responsibleUserId ?? null,
    notes: text(formData.get('notes')),
    active: String(formData.get('active') ?? 'on') === 'on',
  } as const

  if (id) {
    const existing = await prisma.complianceRequirement.findFirst({ where: { id, projectId } })
    if (!existing) return { error: 'That requirement is not on this project.' }

    const updated = await prisma.complianceRequirement.update({ where: { id }, data })
    await recordFieldChanges({
      actor: user,
      entity: 'ComplianceRequirement',
      entityId: id,
      entityLabel: `${project.number} ${title}`,
      before: {
        kind: existing.kind,
        title: existing.title,
        agency: existing.agency,
        frequency: existing.frequency,
        firstDueDate: existing.firstDueDate,
        endsOn: existing.endsOn,
        leadDays: existing.leadDays,
        responsibleUserId: existing.responsibleUserId,
        notes: existing.notes,
        active: existing.active,
      },
      after: {
        kind: updated.kind,
        title: updated.title,
        agency: updated.agency,
        frequency: updated.frequency,
        firstDueDate: updated.firstDueDate,
        endsOn: updated.endsOn,
        leadDays: updated.leadDays,
        responsibleUserId: updated.responsibleUserId,
        notes: updated.notes,
        active: updated.active,
      },
      labels: REQUIREMENT_LABELS,
    })
  } else {
    const last = await prisma.complianceRequirement.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.complianceRequirement.create({
      data: { ...data, projectId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'ComplianceRequirement',
      entityId: created.id,
      entityLabel: `${project.number} ${title}`,
      action: 'CREATE',
      summary: `${title} added, ${frequency.toLowerCase()} from ${firstDueDate.toISOString().slice(0, 10)}`,
    })
  }

  revalidatePath(`/projects/${projectId}/labor`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/')
  return {}
}

export async function deleteComplianceRequirement(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = String(formData.get('id'))
  const requirement = await prisma.complianceRequirement.findFirst({
    where: { id, project: { companyId: user.companyId } },
    include: { project: { select: { id: true, number: true } }, _count: { select: { submissions: true } } },
  })
  if (!requirement) return { error: 'That requirement is not on this account.' }
  if (requirement._count.submissions > 0) {
    return {
      error: `${requirement.title} has ${requirement._count.submissions} recorded filings. Mark it no longer required instead, so the record of what was filed survives.`,
    }
  }

  await prisma.complianceRequirement.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ComplianceRequirement',
    entityId: id,
    entityLabel: `${requirement.project.number} ${requirement.title}`,
    action: 'DELETE',
    summary: `${requirement.title} removed from ${requirement.project.number}`,
  })

  revalidatePath(`/projects/${requirement.projectId}/labor`)
  return {}
}

/** Records a filing against the deadline it answers. */
export async function recordComplianceSubmission(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const requirementId = String(formData.get('requirementId'))
  const dueDate = day(formData.get('dueDate'))
  const submittedAt = day(formData.get('submittedAt')) ?? new Date()
  const periodEnd = day(formData.get('periodEnd'))

  if (!dueDate) return { error: 'Say which deadline this filing answers.' }

  const requirement = await prisma.complianceRequirement.findFirst({
    where: { id: requirementId, project: { companyId: user.companyId } },
    include: { project: { select: { id: true, number: true } } },
  })
  if (!requirement) return { error: 'That requirement is not on this account.' }

  const existing = await prisma.complianceSubmission.findFirst({
    where: { requirementId, dueDate },
    select: { id: true },
  })
  if (existing) return { error: 'A filing is already recorded against that deadline.' }

  const created = await prisma.complianceSubmission.create({
    data: {
      requirementId,
      dueDate,
      periodEnd,
      submittedAt,
      submittedById: user.id,
      reference: text(formData.get('reference')),
      notes: text(formData.get('notes')),
    },
  })

  const late = submittedAt.getTime() > dueDate.getTime()
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ComplianceSubmission',
    entityId: created.id,
    entityLabel: `${requirement.project.number} ${requirement.title}`,
    action: 'APPROVE',
    summary: `${requirement.title} for ${dueDate.toISOString().slice(0, 10)} filed${late ? ' late' : ' on time'}`,
  })

  revalidatePath(`/projects/${requirement.projectId}/labor`)
  revalidatePath(`/projects/${requirement.projectId}`)
  revalidatePath('/')
  return {}
}

export async function deleteComplianceSubmission(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = String(formData.get('id'))
  const submission = await prisma.complianceSubmission.findFirst({
    where: { id, requirement: { project: { companyId: user.companyId } } },
    include: { requirement: { include: { project: { select: { id: true, number: true } } } } },
  })
  if (!submission) return { error: 'That filing is not on this account.' }

  await prisma.complianceSubmission.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ComplianceSubmission',
    entityId: id,
    entityLabel: `${submission.requirement.project.number} ${submission.requirement.title}`,
    action: 'DELETE',
    summary: `The filing recorded for ${submission.dueDate.toISOString().slice(0, 10)} was withdrawn, so that deadline is outstanding again`,
  })

  revalidatePath(`/projects/${submission.requirement.projectId}/labor`)
  return {}
}
