'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'

/**
 * The payroll reference data behind every wage sheet.
 *
 * Two rates live at company level because they are federal and identical in
 * every state, and one rate lives on each state because it is issued to the
 * employer once a year. Nothing here is copied onto a sheet: a sheet reads its
 * rates through the state, so correcting a rate here corrects every sheet built
 * on it, which is the only behaviour that can be right.
 */

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function percentOrNull(value: FormDataEntryValue | null): number | null | 'invalid' {
  const raw = String(value ?? '').replace(/[%\s,]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  if (!isFinite(parsed) || parsed < 0 || parsed > 20) return 'invalid'
  return parsed / 100
}

function numberOrNull(value: FormDataEntryValue | null): number | null | 'invalid' {
  const raw = String(value ?? '').replace(/[$,\s]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  if (!isFinite(parsed) || parsed < 0) return 'invalid'
  return parsed
}

/**
 * Saves a state's payroll settings.
 *
 * Changing the state unemployment rate clears the verification, because the
 * record that somebody checked a rate cannot survive the rate being replaced.
 */
export async function saveJurisdiction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id'))
  const existing = await prisma.payrollJurisdiction.findFirst({
    where: { id, companyId: user.companyId },
  })
  if (!existing) return { error: 'That state is not set up on this account.' }

  const sutaPct = percentOrNull(formData.get('sutaPct'))
  if (sutaPct === 'invalid') return { error: 'Enter the state unemployment rate as a percentage between 0 and 20.' }

  const sutaWageBase = numberOrNull(formData.get('sutaWageBase'))
  if (sutaWageBase === 'invalid') return { error: 'The taxable wage base is a dollar amount and cannot be negative.' }

  const yearRaw = String(formData.get('sutaRateYear') ?? '').trim()
  const sutaRateYear = yearRaw ? Number(yearRaw) : null
  if (sutaRateYear !== null && (!Number.isInteger(sutaRateYear) || sutaRateYear < 2000 || sutaRateYear > 2100)) {
    return { error: 'Enter the year the rate was issued for as four digits.' }
  }

  const basis = String(formData.get('workersCompBasis') ?? 'PER_100_PAYROLL')
  if (basis !== 'PER_HOUR' && basis !== 'PER_100_PAYROLL') {
    return { error: 'Choose how workers compensation is quoted in this state.' }
  }

  const rateChanged = existing.sutaPct !== sutaPct
  const values = {
    sutaPct,
    sutaWageBase,
    sutaRateYear,
    workersCompBasis: basis,
    stateFund: String(formData.get('stateFund') ?? '') === 'on',
    wageAuthority: text(formData.get('wageAuthority')),
    notes: text(formData.get('notes')),
    active: String(formData.get('active') ?? '') === 'on',
  } as const

  const updated = await prisma.payrollJurisdiction.update({
    where: { id },
    data: rateChanged ? { ...values, verifiedAt: null, verifiedById: null, verifiedNote: null } : values,
  })

  await recordFieldChanges({
    actor: user,
    entity: 'PayrollJurisdiction',
    entityId: id,
    entityLabel: existing.name,
    before: {
      sutaPct: existing.sutaPct,
      sutaWageBase: existing.sutaWageBase,
      sutaRateYear: existing.sutaRateYear,
      workersCompBasis: existing.workersCompBasis,
      stateFund: existing.stateFund,
      wageAuthority: existing.wageAuthority,
      notes: existing.notes,
      active: existing.active,
    },
    after: {
      sutaPct: updated.sutaPct,
      sutaWageBase: updated.sutaWageBase,
      sutaRateYear: updated.sutaRateYear,
      workersCompBasis: updated.workersCompBasis,
      stateFund: updated.stateFund,
      wageAuthority: updated.wageAuthority,
      notes: updated.notes,
      active: updated.active,
    },
    labels: {
      sutaPct: 'state unemployment rate',
      sutaWageBase: 'taxable wage base',
      sutaRateYear: 'rate year',
      workersCompBasis: 'workers compensation basis',
      stateFund: 'state fund',
      wageAuthority: 'wage determination authority',
      notes: 'notes',
      active: 'in use',
    },
  })

  if (rateChanged && existing.verifiedAt) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'PayrollJurisdiction',
      entityId: id,
      entityLabel: existing.name,
      action: 'UNLOCK',
      summary: 'Verification cleared because the state unemployment rate was changed',
    })
  }

  revalidatePath('/admin/payroll')
  return {}
}

/** Records that somebody checked a state's rate against the annual notice. */
export async function verifyJurisdiction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id'))
  const note = text(formData.get('verifiedNote'))
  const clearing = String(formData.get('clear') ?? '') === 'true'

  const jurisdiction = await prisma.payrollJurisdiction.findFirst({
    where: { id, companyId: user.companyId },
  })
  if (!jurisdiction) return { error: 'That state is not set up on this account.' }

  if (!clearing) {
    if (jurisdiction.sutaPct === null) {
      return { error: 'Enter the state unemployment rate before verifying it. There is nothing to verify yet.' }
    }
    if (!note) {
      return { error: 'Say where the rate came from, for example the year and the notice it was taken off.' }
    }
  }

  await prisma.payrollJurisdiction.update({
    where: { id },
    data: clearing
      ? { verifiedAt: null, verifiedById: null, verifiedNote: null }
      : { verifiedAt: new Date(), verifiedById: user.id, verifiedNote: note },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'PayrollJurisdiction',
    entityId: id,
    entityLabel: jurisdiction.name,
    action: clearing ? 'UNLOCK' : 'APPROVE',
    summary: clearing
      ? `Verification withdrawn from the ${jurisdiction.name} unemployment rate`
      : `${jurisdiction.name} unemployment rate verified: ${note}`,
  })

  revalidatePath('/admin/payroll')
  return {}
}

/** Adds or renames a county inside a state. */
export async function saveCounty(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = text(formData.get('id'))
  const jurisdictionId = String(formData.get('jurisdictionId'))
  const name = text(formData.get('name'))
  const notes = text(formData.get('notes'))
  if (!name) return { error: 'Name the county.' }

  const jurisdiction = await prisma.payrollJurisdiction.findFirst({
    where: { id: jurisdictionId, companyId: user.companyId },
    select: { id: true, name: true },
  })
  if (!jurisdiction) return { error: 'That state is not set up on this account.' }

  const clash = await prisma.payrollCounty.findFirst({
    where: { jurisdictionId, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `${jurisdiction.name} already has a county called ${name}.` }

  if (id) {
    const existing = await prisma.payrollCounty.findFirst({ where: { id, jurisdictionId } })
    if (!existing) return { error: 'That county is not in this state.' }
    const updated = await prisma.payrollCounty.update({ where: { id }, data: { name, notes } })
    await recordFieldChanges({
      actor: user,
      entity: 'PayrollCounty',
      entityId: id,
      entityLabel: `${jurisdiction.name}, ${name}`,
      before: { name: existing.name, notes: existing.notes },
      after: { name: updated.name, notes: updated.notes },
      labels: { name: 'county name', notes: 'notes' },
    })
  } else {
    const created = await prisma.payrollCounty.create({ data: { jurisdictionId, name, notes } })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'PayrollCounty',
      entityId: created.id,
      entityLabel: `${jurisdiction.name}, ${name}`,
      action: 'CREATE',
      summary: `${name} added to ${jurisdiction.name}`,
    })
  }

  revalidatePath('/admin/payroll')
  return {}
}

export async function deleteCounty(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id'))
  const county = await prisma.payrollCounty.findFirst({
    where: { id, jurisdiction: { companyId: user.companyId } },
    include: { jurisdiction: { select: { name: true } }, _count: { select: { sheets: true } } },
  })
  if (!county) return { error: 'That county is not on this account.' }
  if (county._count.sheets > 0) {
    return {
      error: `${county.name} is named on ${county._count.sheets} wage sheet${county._count.sheets === 1 ? '' : 's'}. Move those sheets first.`,
    }
  }

  await prisma.payrollCounty.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'PayrollCounty',
    entityId: id,
    entityLabel: `${county.jurisdiction.name}, ${county.name}`,
    action: 'DELETE',
    summary: `${county.name} removed from ${county.jurisdiction.name}`,
  })

  revalidatePath('/admin/payroll')
  return {}
}

/** The two federal rates, which are the same in every state. */
export async function saveFederalRates(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:company_settings')

  const futaPct = percentOrNull(formData.get('futaPct'))
  const ficaPct = percentOrNull(formData.get('ficaPct'))
  if (futaPct === 'invalid' || futaPct === null) return { error: 'Enter the federal unemployment rate as a percentage.' }
  if (ficaPct === 'invalid' || ficaPct === null) return { error: 'Enter the social security and Medicare rate as a percentage.' }

  const before = await prisma.company.findUniqueOrThrow({
    where: { id: user.companyId },
    select: { futaPct: true, ficaPct: true, name: true },
  })
  const after = await prisma.company.update({
    where: { id: user.companyId },
    data: { futaPct, ficaPct },
    select: { futaPct: true, ficaPct: true },
  })

  await recordFieldChanges({
    actor: user,
    entity: 'Company',
    entityId: user.companyId,
    entityLabel: before.name,
    before: { futaPct: before.futaPct, ficaPct: before.ficaPct },
    after,
    labels: { futaPct: 'federal unemployment rate', ficaPct: 'social security and Medicare rate' },
  })

  revalidatePath('/admin/payroll')
  return {}
}
