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

/**
 * Enters unemployment rates for many states at once.
 *
 * Fifty-one jurisdictions ship with no rate, deliberately: the rate is assigned
 * to each employer every year, so a figure supplied here would be wrong for
 * most companies on the day it shipped. The consequence was that nobody could
 * compute a loaded labor rate until somebody had opened fifty-one forms.
 *
 * Most contractors work in two or three states, so this takes the annual notice
 * as it is written down, one state and one rate a line, in whatever order and
 * whatever punctuation. A line that cannot be read is reported by its own text
 * rather than being silently dropped, because a rate that quietly failed to
 * save is a labor cost quietly priced light.
 *
 * A rate entered this way is unverified, exactly as it would be if it had been
 * typed into the form, so somebody still has to say they checked it.
 */
export async function importJurisdictionRates(formData: FormData): Promise<{
  error?: string
  applied?: number
  skipped?: string[]
}> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const raw = String(formData.get('rates') ?? '').trim()
  if (!raw) return { error: 'Paste the states and their rates, one to a line.' }

  const yearRaw = String(formData.get('sutaRateYear') ?? '').trim()
  const sutaRateYear = yearRaw ? Number(yearRaw) : null
  if (sutaRateYear !== null && (!Number.isInteger(sutaRateYear) || sutaRateYear < 2000 || sutaRateYear > 2100)) {
    return { error: 'Enter the year these rates were issued for as four digits.' }
  }

  const jurisdictions = await prisma.payrollJurisdiction.findMany({
    where: { companyId: user.companyId },
    select: { id: true, code: true, name: true, sutaPct: true, verifiedAt: true },
  })
  const byCode = new Map(jurisdictions.map((entry) => [entry.code.toUpperCase(), entry]))
  const byName = new Map(jurisdictions.map((entry) => [entry.name.toLowerCase(), entry]))

  const skipped: string[] = []
  let applied = 0

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // State first, rate last, separated by a comma, a tab or run of spaces.
    // Written how a notice writes it, not how a parser would prefer it.
    const match = trimmed.match(/^(.*?)[,\t]?\s+([\d.]+)\s*%?$/)
    if (!match) {
      skipped.push(`${trimmed} (could not tell the state from the rate)`)
      continue
    }

    const label = match[1].trim().replace(/[,;:]$/, '')
    const jurisdiction = byCode.get(label.toUpperCase()) ?? byName.get(label.toLowerCase())
    if (!jurisdiction) {
      skipped.push(`${trimmed} (no state called ${label})`)
      continue
    }

    const entered = Number(match[2])
    if (!isFinite(entered) || entered < 0 || entered > 20) {
      skipped.push(`${trimmed} (a rate has to be between 0 and 20 percent)`)
      continue
    }

    // Written as a percentage on the notice, held as a fraction here, which is
    // the same convention the single-state form uses.
    const sutaPct = entered / 100
    const rateChanged = jurisdiction.sutaPct !== sutaPct

    await prisma.payrollJurisdiction.update({
      where: { id: jurisdiction.id },
      data: {
        sutaPct,
        ...(sutaRateYear !== null ? { sutaRateYear } : {}),
        // A changed rate is a new fact, so whoever checked the old one has not
        // checked this one.
        ...(rateChanged ? { verifiedAt: null, verifiedById: null, verifiedNote: null } : {}),
      },
    })

    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'PayrollJurisdiction',
      entityId: jurisdiction.id,
      entityLabel: jurisdiction.name,
      action: 'UPDATE',
      field: 'sutaPct',
      oldValue: jurisdiction.sutaPct,
      newValue: sutaPct,
      summary: `State unemployment rate for ${jurisdiction.name} set to ${entered} percent${sutaRateYear ? ` for ${sutaRateYear}` : ''}, entered in bulk and not yet checked`,
    })
    applied++
  }

  revalidatePath('/admin/payroll')
  if (applied === 0 && skipped.length > 0) {
    return { error: `Nothing was read from that. ${skipped[0]}`, skipped }
  }
  return { applied, skipped }
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

/**
 * Adds many counties to one state at once.
 *
 * Counties come complete for the states this system was built against and
 * nowhere else, because a county list invented rather than taken from the
 * state's own publication is a list that will be wrong somewhere, and
 * prevailing wage is determined county by county. So the list is pasted from
 * the source, one to a line, and this only has to avoid duplicating what is
 * already there.
 *
 * A name already on the state is skipped rather than reported as an error: a
 * list pasted twice, or extended and pasted again, is the ordinary case and
 * should not need somebody to work out which lines are new.
 */
export async function importCounties(formData: FormData): Promise<{
  error?: string
  added?: number
  alreadyThere?: number
}> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const jurisdictionId = String(formData.get('jurisdictionId'))
  const raw = String(formData.get('counties') ?? '').trim()
  if (!raw) return { error: 'Paste the counties, one to a line.' }

  const jurisdiction = await prisma.payrollJurisdiction.findFirst({
    where: { id: jurisdictionId, companyId: user.companyId },
    select: { id: true, name: true },
  })
  if (!jurisdiction) return { error: 'That state is not set up on this account.' }

  const existing = await prisma.payrollCounty.findMany({
    where: { jurisdictionId },
    select: { name: true },
  })
  const already = new Set(existing.map((county) => county.name.toLowerCase()))

  // Lines, or one line of comma separated names, which is how these are
  // published about half the time.
  const names = raw
    .split(/\r?\n|,/)
    .map((entry) => entry.trim().replace(/\s+County$/i, '').trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith('#'))

  const seen = new Set<string>()
  const toCreate: string[] = []
  let alreadyThere = 0

  for (const name of names) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (already.has(key)) {
      alreadyThere++
      continue
    }
    toCreate.push(name)
  }

  if (toCreate.length === 0) {
    return { added: 0, alreadyThere }
  }

  await prisma.payrollCounty.createMany({
    data: toCreate.map((name) => ({ jurisdictionId, name })),
  })

  // One audit entry for the batch rather than one per county: the fact worth
  // recording is that somebody loaded a county list, and forty rows saying the
  // same thing would bury the entries that matter.
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'PayrollJurisdiction',
    entityId: jurisdiction.id,
    entityLabel: jurisdiction.name,
    action: 'CREATE',
    summary: `${toCreate.length} counties added to ${jurisdiction.name}: ${toCreate.slice(0, 12).join(', ')}${toCreate.length > 12 ? ' and others' : ''}`,
  })

  revalidatePath('/admin/payroll')
  return { added: toCreate.length, alreadyThere }
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
