'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'
import type {
  CostCategory,
  LaborKind,
  OverheadCategory,
  OverheadPeriod,
  PayBasis,
} from '@/generated/prisma/client'

/**
 * The classification library and the overhead cost list.
 *
 * Both are company-wide reference data, and both are read live by everything
 * downstream: a wage changed here reprices open estimates, every project team
 * assignment built on that class, and the overhead recovery rate. Nothing is
 * copied anywhere, so there is no second copy to go stale.
 */

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function money(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/[$,%\s]/g, ''))
  return isFinite(parsed) ? parsed : 0
}

const KINDS = new Set<string>(['FIELD', 'STAFF'] satisfies LaborKind[])
const PAY_BASES = new Set<string>(['HOURLY', 'SALARY'] satisfies PayBasis[])
const CATEGORIES = new Set<string>([
  'LABOR',
  'MATERIAL',
  'EQUIPMENT',
  'SUBCONTRACT',
  'GENERAL_CONDITIONS',
  'OVERHEAD',
  'CONTINGENCY',
  'OTHER',
] satisfies CostCategory[])

const CLASS_LABELS: Record<string, string> = {
  code: 'code',
  name: 'name',
  kind: 'kind',
  payBasis: 'pay basis',
  baseAmount: 'wage or salary',
  benefitsAmount: 'benefits',
  annualHours: 'annual hours',
  trainingPerHour: 'training per hour',
  workersCompRate: 'workers compensation rate',
  jurisdictionId: 'state',
  costCategory: 'cost type',
  tradeId: 'trade',
  notes: 'notes',
  active: 'in use',
}

function classFields(row: {
  code: string | null
  name: string
  kind: string
  payBasis: string
  baseAmount: number
  benefitsAmount: number
  annualHours: number
  trainingPerHour: number
  workersCompRate: number
  jurisdictionId: string | null
  costCategory: string
  tradeId: string | null
  notes: string | null
  active: boolean
}) {
  return {
    code: row.code,
    name: row.name,
    kind: row.kind,
    payBasis: row.payBasis,
    baseAmount: row.baseAmount,
    benefitsAmount: row.benefitsAmount,
    annualHours: row.annualHours,
    trainingPerHour: row.trainingPerHour,
    workersCompRate: row.workersCompRate,
    jurisdictionId: row.jurisdictionId,
    costCategory: row.costCategory,
    tradeId: row.tradeId,
    notes: row.notes,
    active: row.active,
  }
}

export async function saveLaborClassification(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const kind = String(formData.get('kind') ?? 'FIELD')
  const payBasis = String(formData.get('payBasis') ?? 'HOURLY')
  const costCategory = String(formData.get('costCategory') ?? 'LABOR')

  if (!name) return { error: 'Name the classification, for example "Carpenter, journey level".' }
  if (!KINDS.has(kind)) return { error: 'Choose whether this is field labor or project team.' }
  if (!PAY_BASES.has(payBasis)) return { error: 'Choose whether this classification is paid hourly or salaried.' }
  if (!CATEGORIES.has(costCategory)) return { error: 'Choose the cost type this person lands in.' }

  const baseAmount = money(formData.get('baseAmount'))
  const benefitsAmount = money(formData.get('benefitsAmount'))
  const annualHours = money(formData.get('annualHours'))
  const trainingPerHour = money(formData.get('trainingPerHour'))
  const workersCompRate = money(formData.get('workersCompRate'))

  for (const [label, value] of [
    ['wage or salary', baseAmount],
    ['benefits', benefitsAmount],
    ['training amount', trainingPerHour],
    ['workers compensation rate', workersCompRate],
  ] as const) {
    if (value < 0) return { error: `The ${label} cannot be negative.` }
  }
  if (payBasis === 'SALARY' && annualHours <= 0) {
    return { error: 'A salary needs the hours a year it is spread over. Without them it cannot be reduced to an hour.' }
  }
  if (annualHours > 8760) return { error: 'There are not that many hours in a year.' }

  const jurisdictionId = text(formData.get('jurisdictionId'))
  if (jurisdictionId) {
    const jurisdiction = await prisma.payrollJurisdiction.findFirst({
      where: { id: jurisdictionId, companyId: user.companyId },
      select: { id: true },
    })
    if (!jurisdiction) return { error: 'That state is not set up on this account.' }
  }

  const tradeId = text(formData.get('tradeId'))
  if (tradeId) {
    const trade = await prisma.trade.findFirst({
      where: { id: tradeId, companyId: user.companyId },
      select: { id: true },
    })
    if (!trade) return { error: 'That trade is not on this account.' }
  }

  const clash = await prisma.laborClassification.findFirst({
    where: { companyId: user.companyId, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `There is already a classification called ${name}.` }

  // Checked against the sets above, so the narrowing here is the validation
  // already done rather than a claim about unchecked input.
  const data = {
    code: text(formData.get('code')),
    name,
    kind: kind as LaborKind,
    payBasis: payBasis as PayBasis,
    baseAmount,
    benefitsAmount,
    annualHours: payBasis === 'SALARY' ? annualHours : annualHours || 2080,
    trainingPerHour,
    workersCompRate,
    jurisdictionId: jurisdictionId ?? null,
    costCategory: costCategory as CostCategory,
    tradeId: tradeId ?? null,
    notes: text(formData.get('notes')),
    active: String(formData.get('active') ?? 'on') === 'on',
  } as const

  if (id) {
    const existing = await prisma.laborClassification.findFirst({
      where: { id, companyId: user.companyId },
    })
    if (!existing) return { error: 'That classification is not on this account.' }

    const updated = await prisma.laborClassification.update({ where: { id }, data })
    await recordFieldChanges({
      actor: user,
      entity: 'LaborClassification',
      entityId: id,
      entityLabel: name,
      before: classFields(existing),
      after: classFields(updated),
      labels: CLASS_LABELS,
    })
  } else {
    const last = await prisma.laborClassification.findFirst({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.laborClassification.create({
      data: { ...data, companyId: user.companyId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'LaborClassification',
      entityId: created.id,
      entityLabel: name,
      action: 'CREATE',
      summary:
        payBasis === 'SALARY'
          ? `${name} added on a salary of ${baseAmount} over ${annualHours} hours`
          : `${name} added at ${baseAmount} an hour`,
    })
  }

  revalidatePath('/admin/labor')
  return {}
}

export async function deleteLaborClassification(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id'))
  const classification = await prisma.laborClassification.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { assignments: true, estimateRates: true } } },
  })
  if (!classification) return { error: 'That classification is not on this account.' }

  const used = classification._count.assignments + classification._count.estimateRates
  if (used > 0) {
    return {
      error: `${classification.name} is used by ${classification._count.assignments} project assignments and ${classification._count.estimateRates} estimate rates. Mark it out of use instead, so what it already priced is not disturbed.`,
    }
  }

  await prisma.laborClassification.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'LaborClassification',
    entityId: id,
    entityLabel: classification.name,
    action: 'DELETE',
    summary: `${classification.name} removed from the classification library`,
  })

  revalidatePath('/admin/labor')
  return {}
}

// ── Overhead ──────────────────────────────────────────────────────────────

const OVERHEAD_CATEGORIES = new Set<string>([
  'OFFICE',
  'VEHICLES',
  'SOFTWARE',
  'INSURANCE',
  'EQUIPMENT',
  'PROFESSIONAL',
  'MARKETING',
  'TRAINING',
  'OTHER',
] satisfies OverheadCategory[])

const OVERHEAD_PERIODS = new Set<string>(['MONTHLY', 'ANNUAL', 'ONE_TIME'] satisfies OverheadPeriod[])

export async function saveOverheadCost(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const category = String(formData.get('category') ?? 'OTHER')
  const period = String(formData.get('period') ?? 'MONTHLY')
  const amount = money(formData.get('amount'))

  if (!name) return { error: 'Name the cost, for example "Office rent" or "Estimating software".' }
  if (!OVERHEAD_CATEGORIES.has(category)) return { error: 'Choose what kind of cost this is.' }
  if (!OVERHEAD_PERIODS.has(period)) return { error: 'Choose whether this is monthly, annual or one time.' }
  if (amount < 0) return { error: 'The amount cannot be negative.' }

  const clash = await prisma.overheadCost.findFirst({
    where: { companyId: user.companyId, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `There is already an overhead cost called ${name}.` }

  const data = {
    name,
    category: category as OverheadCategory,
    period: period as OverheadPeriod,
    amount,
    incurredOn: (() => {
      const raw = String(formData.get('incurredOn') ?? '').trim()
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null
    })(),
    notes: text(formData.get('notes')),
    active: String(formData.get('active') ?? 'on') === 'on',
  } as const

  if (id) {
    const existing = await prisma.overheadCost.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) return { error: 'That cost is not on this account.' }

    const updated = await prisma.overheadCost.update({ where: { id }, data })
    await recordFieldChanges({
      actor: user,
      entity: 'OverheadCost',
      entityId: id,
      entityLabel: name,
      before: {
        name: existing.name,
        category: existing.category,
        period: existing.period,
        amount: existing.amount,
        incurredOn: existing.incurredOn,
        notes: existing.notes,
        active: existing.active,
      },
      after: {
        name: updated.name,
        category: updated.category,
        period: updated.period,
        amount: updated.amount,
        incurredOn: updated.incurredOn,
        notes: updated.notes,
        active: updated.active,
      },
      labels: {
        name: 'name',
        category: 'category',
        period: 'period',
        amount: 'amount',
        incurredOn: 'incurred on',
        notes: 'notes',
        active: 'in use',
      },
    })
  } else {
    const last = await prisma.overheadCost.findFirst({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.overheadCost.create({
      data: { ...data, companyId: user.companyId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'OverheadCost',
      entityId: created.id,
      entityLabel: name,
      action: 'CREATE',
      summary: `${name} added at ${amount} ${period.toLowerCase().replace('_', ' ')}`,
    })
  }

  revalidatePath('/admin/labor')
  return {}
}

export async function deleteOverheadCost(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id'))
  const cost = await prisma.overheadCost.findFirst({ where: { id, companyId: user.companyId } })
  if (!cost) return { error: 'That cost is not on this account.' }

  await prisma.overheadCost.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'OverheadCost',
    entityId: id,
    entityLabel: cost.name,
    action: 'DELETE',
    summary: `${cost.name} removed from the overhead list`,
  })

  revalidatePath('/admin/labor')
  return {}
}

/**
 * Adopts the derived overhead rate as the rate carried in bids.
 *
 * Deliberately a separate act from working the rate out. Seeing that the
 * company is under-recovering is one decision; changing what every future bid
 * charges is another, and it should be somebody's choice with their name on it.
 */
export async function adoptDerivedOverheadRate(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:company_settings')

  const rate = Number(String(formData.get('derivedRate') ?? ''))
  if (!isFinite(rate) || rate <= 0 || rate > 0.5) {
    return { error: 'That rate is not one to adopt. Check the overhead list and the revenue behind it first.' }
  }

  const before = await prisma.company.findUniqueOrThrow({
    where: { id: user.companyId },
    select: { defaultOverheadPct: true, name: true },
  })
  await prisma.company.update({ where: { id: user.companyId }, data: { defaultOverheadPct: rate } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Company',
    entityId: user.companyId,
    entityLabel: before.name,
    action: 'UPDATE',
    field: 'defaultOverheadPct',
    oldValue: before.defaultOverheadPct,
    newValue: rate,
    summary: `Overhead rate carried in bids moved to the ${(rate * 100).toFixed(2)} percent the cost list works out to`,
  })

  revalidatePath('/admin/labor')
  revalidatePath('/admin')
  return {}
}
