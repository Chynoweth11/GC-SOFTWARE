'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'

/**
 * Wage sheets, the trades on them, and the record that somebody checked them.
 *
 * Only the entered boxes are stored. Every subtotal, burden, total and average
 * is worked out on the way to the screen, so a sheet cannot be saved with a
 * total that disagrees with its own lines.
 */

function money(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''))
  return isFinite(parsed) ? parsed : 0
}

function optionalMoney(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').replace(/[$,\s]/g, '')
  if (!text) return null
  const parsed = Number(text)
  return isFinite(parsed) ? parsed : null
}

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function day(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null
}

/**
 * The fields worth writing history for, and what to call them in it.
 *
 * Narrowed deliberately: the audit trail should read like a person describing
 * the change, not like a row dump with a new timestamp on every save.
 */
const SHEET_LABELS: Record<string, string> = {
  name: 'sheet name',
  jurisdictionId: 'state',
  countyId: 'county',
  rateScheduleDate: 'rate schedule date',
  determinationRef: 'determination reference',
  sutaPctOverride: 'state unemployment rate override',
  notes: 'notes',
}

function sheetFields(sheet: {
  name: string
  jurisdictionId: string
  countyId: string | null
  rateScheduleDate: Date | null
  determinationRef: string | null
  sutaPctOverride: number | null
  notes: string | null
}) {
  return {
    name: sheet.name,
    jurisdictionId: sheet.jurisdictionId,
    countyId: sheet.countyId,
    rateScheduleDate: sheet.rateScheduleDate,
    determinationRef: sheet.determinationRef,
    sutaPctOverride: sheet.sutaPctOverride,
    notes: sheet.notes,
  }
}

const LINE_LABELS: Record<string, string> = {
  trade: 'trade',
  classification: 'classification',
  hourlyWage: 'hourly wage',
  hourlyBenefits: 'hourly benefit',
  trainingPerHour: 'training per hour',
  workersCompPerHour: 'workers compensation per hour',
  overtimeMultiplier: 'overtime multiplier',
  publishedBaseWage: 'published base wage',
  publishedFringe: 'published fringe',
  notes: 'notes',
}

function lineFields(line: {
  trade: string
  classification: string | null
  hourlyWage: number
  hourlyBenefits: number
  trainingPerHour: number
  workersCompPerHour: number
  overtimeMultiplier: number
  publishedBaseWage: number | null
  publishedFringe: number | null
  notes: string | null
}) {
  return {
    trade: line.trade,
    classification: line.classification,
    hourlyWage: line.hourlyWage,
    hourlyBenefits: line.hourlyBenefits,
    trainingPerHour: line.trainingPerHour,
    workersCompPerHour: line.workersCompPerHour,
    overtimeMultiplier: line.overtimeMultiplier,
    publishedBaseWage: line.publishedBaseWage,
    publishedFringe: line.publishedFringe,
    notes: line.notes,
  }
}

async function ownedSheet(sheetId: string, companyId: string) {
  return prisma.wageRateSheet.findFirst({
    where: { id: sheetId, project: { companyId } },
    include: { project: { select: { id: true, number: true, name: true } }, jurisdiction: true, county: true },
  })
}

export async function saveWageSheet(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = text(formData.get('id'))
  const projectId = String(formData.get('projectId'))
  const name = text(formData.get('name'))
  const jurisdictionId = text(formData.get('jurisdictionId'))
  const countyId = text(formData.get('countyId'))
  const rateScheduleDate = day(formData.get('rateScheduleDate'))
  const determinationRef = text(formData.get('determinationRef'))
  const sutaPctOverride = optionalMoney(formData.get('sutaPctOverride'))
  const notes = text(formData.get('notes'))

  if (!name) return { error: 'Give the sheet a name, for example "Journey level, Benton County".' }
  if (!jurisdictionId) return { error: 'Choose the state the work is in.' }
  if (sutaPctOverride !== null && (sutaPctOverride < 0 || sutaPctOverride > 20)) {
    return { error: 'Enter the state unemployment rate as a percentage between 0 and 20.' }
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true, number: true, name: true },
  })
  if (!project) return { error: 'That project is not on this account.' }

  const jurisdiction = await prisma.payrollJurisdiction.findFirst({
    where: { id: jurisdictionId, companyId: user.companyId },
    select: { id: true, name: true },
  })
  if (!jurisdiction) return { error: 'That state is not set up on this account.' }

  if (countyId) {
    const county = await prisma.payrollCounty.findFirst({
      where: { id: countyId, jurisdictionId },
      select: { id: true },
    })
    if (!county) return { error: `That county is not in ${jurisdiction.name}.` }
  }

  // Stored as a fraction throughout, entered as a percentage, converted once here.
  const overrideFraction = sutaPctOverride === null ? null : sutaPctOverride / 100

  const clash = await prisma.wageRateSheet.findFirst({
    where: { projectId, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `This project already has a wage sheet called "${name}".` }

  if (id) {
    const existing = await ownedSheet(id, user.companyId)
    if (!existing) return { error: 'That wage sheet is not on this account.' }

    const updated = await prisma.wageRateSheet.update({
      where: { id },
      data: {
        name,
        jurisdictionId,
        countyId: countyId ?? null,
        rateScheduleDate,
        determinationRef,
        sutaPctOverride: overrideFraction,
        notes,
      },
    })

    // Changing the schedule the sheet was built from invalidates the check that
    // somebody made against the old one, so the verification is cleared rather
    // than left standing over rates it was never applied to.
    const scheduleMoved =
      existing.jurisdictionId !== jurisdictionId ||
      (existing.countyId ?? null) !== (countyId ?? null) ||
      existing.rateScheduleDate?.getTime() !== rateScheduleDate?.getTime()

    if (scheduleMoved && existing.verifiedAt) {
      await prisma.wageRateSheet.update({
        where: { id },
        data: { verifiedAt: null, verifiedById: null, verifiedNote: null },
      })
      await recordAudit({
        companyId: user.companyId,
        userId: user.id,
        actor: user,
        entity: 'WageRateSheet',
        entityId: id,
        entityLabel: `${project.number} ${name}`,
        action: 'UNLOCK',
        summary: 'Verification cleared because the rate schedule behind the sheet changed',
      })
    }

    await recordFieldChanges({
      actor: user,
      entity: 'WageRateSheet',
      entityId: id,
      entityLabel: `${project.number} ${name}`,
      before: sheetFields(existing),
      after: sheetFields(updated),
      labels: SHEET_LABELS,
    })
  } else {
    const created = await prisma.wageRateSheet.create({
      data: {
        projectId,
        name,
        jurisdictionId,
        countyId: countyId ?? null,
        rateScheduleDate,
        determinationRef,
        sutaPctOverride: overrideFraction,
        notes,
      },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'WageRateSheet',
      entityId: created.id,
      entityLabel: `${project.number} ${name}`,
      action: 'CREATE',
      summary: `Wage sheet "${name}" opened for ${jurisdiction.name}`,
    })
  }

  revalidatePath(`/projects/${projectId}/wage-rates`)
  return {}
}

export async function deleteWageSheet(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = String(formData.get('id'))
  const sheet = await ownedSheet(id, user.companyId)
  if (!sheet) return { error: 'That wage sheet is not on this account.' }

  await prisma.wageRateSheet.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'WageRateSheet',
    entityId: id,
    entityLabel: `${sheet.project.number} ${sheet.name}`,
    action: 'DELETE',
    summary: `Wage sheet "${sheet.name}" deleted from ${sheet.project.number}`,
  })

  revalidatePath(`/projects/${sheet.projectId}/wage-rates`)
  return {}
}

export async function saveWageLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = text(formData.get('id'))
  const sheetId = String(formData.get('sheetId'))
  const trade = text(formData.get('trade'))
  if (!trade) return { error: 'Name the trade as the schedule names it.' }

  const sheet = await ownedSheet(sheetId, user.companyId)
  if (!sheet) return { error: 'That wage sheet is not on this account.' }

  const hourlyWage = money(formData.get('hourlyWage'))
  const hourlyBenefits = money(formData.get('hourlyBenefits'))
  const trainingPerHour = money(formData.get('trainingPerHour'))
  const workersCompPerHour = money(formData.get('workersCompPerHour'))
  const rawMultiplier = money(formData.get('overtimeMultiplier'))
  const overtimeMultiplier = rawMultiplier >= 1 ? rawMultiplier : 1.5

  for (const [label, value] of [
    ['hourly wage', hourlyWage],
    ['hourly benefit', hourlyBenefits],
    ['training amount', trainingPerHour],
    ['workers compensation amount', workersCompPerHour],
  ] as const) {
    if (value < 0) return { error: `The ${label} cannot be negative.` }
  }

  const data = {
    trade,
    classification: text(formData.get('classification')),
    hourlyWage,
    hourlyBenefits,
    trainingPerHour,
    workersCompPerHour,
    overtimeMultiplier,
    publishedBaseWage: optionalMoney(formData.get('publishedBaseWage')),
    publishedFringe: optionalMoney(formData.get('publishedFringe')),
    notes: text(formData.get('notes')),
  }

  const clash = await prisma.wageRateLine.findFirst({
    where: { sheetId, trade, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `"${trade}" is already on this sheet. Edit that row instead of adding a second one.` }

  if (id) {
    const existing = await prisma.wageRateLine.findFirst({ where: { id, sheetId } })
    if (!existing) return { error: 'That trade is not on this sheet.' }

    const updated = await prisma.wageRateLine.update({ where: { id }, data })
    await recordFieldChanges({
      actor: user,
      entity: 'WageRateLine',
      entityId: id,
      entityLabel: `${sheet.project.number} ${sheet.name}, ${trade}`,
      before: lineFields(existing),
      after: lineFields(updated),
      labels: LINE_LABELS,
    })
  } else {
    const last = await prisma.wageRateLine.findFirst({
      where: { sheetId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.wageRateLine.create({
      data: { ...data, sheetId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'WageRateLine',
      entityId: created.id,
      entityLabel: `${sheet.project.number} ${sheet.name}, ${trade}`,
      action: 'CREATE',
      summary: `${trade} added at ${hourlyWage} wage and ${hourlyBenefits} fringe`,
    })
  }

  revalidatePath(`/projects/${sheet.projectId}/wage-rates`)
  return {}
}

export async function deleteWageLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = String(formData.get('id'))
  const line = await prisma.wageRateLine.findFirst({
    where: { id, sheet: { project: { companyId: user.companyId } } },
    include: { sheet: { include: { project: { select: { number: true } } } } },
  })
  if (!line) return { error: 'That trade is not on this account.' }

  await prisma.wageRateLine.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'WageRateLine',
    entityId: id,
    entityLabel: `${line.sheet.project.number} ${line.sheet.name}, ${line.trade}`,
    action: 'DELETE',
    summary: `${line.trade} removed from wage sheet "${line.sheet.name}"`,
  })

  revalidatePath(`/projects/${line.sheet.projectId}/wage-rates`)
  return {}
}

/**
 * Records that somebody checked this sheet against the published schedule.
 *
 * The signature is the point of the whole feature. A sheet nobody has checked
 * says so on its face, and the check is attributed and dated so it can be
 * produced later. Editing the schedule the sheet was built from clears it.
 */
export async function verifyWageSheet(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:wage_rates')

  const id = String(formData.get('id'))
  const note = text(formData.get('verifiedNote'))
  const clearing = String(formData.get('clear') ?? '') === 'true'

  const sheet = await ownedSheet(id, user.companyId)
  if (!sheet) return { error: 'That wage sheet is not on this account.' }

  if (!clearing) {
    if (!sheet.rateScheduleDate) {
      return { error: 'Record the rate schedule date before verifying the sheet. A check against an unnamed schedule proves nothing.' }
    }
    if (!note) return { error: 'Say what was checked and against what, so the record means something later.' }
  }

  await prisma.wageRateSheet.update({
    where: { id },
    data: clearing
      ? { verifiedAt: null, verifiedById: null, verifiedNote: null }
      : { verifiedAt: new Date(), verifiedById: user.id, verifiedNote: note },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'WageRateSheet',
    entityId: id,
    entityLabel: `${sheet.project.number} ${sheet.name}`,
    action: clearing ? 'UNLOCK' : 'APPROVE',
    summary: clearing ? 'Verification withdrawn from the wage sheet' : `Wage sheet verified: ${note}`,
  })

  revalidatePath(`/projects/${sheet.projectId}/wage-rates`)
  return {}
}
