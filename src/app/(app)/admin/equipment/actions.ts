'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'
import type { CostCategory, EquipmentOwnership } from '@/generated/prisma/client'

/**
 * The equipment list: what the company owns or hires, and what it costs.
 *
 * Company-wide reference data, read live by everything downstream. A rate
 * changed here reprices the estimate line that names the machine, the change
 * order line that runs it, the time and materials ticket it was on, and the
 * project budget it lands in. Nothing holds a copy.
 */

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function money(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''))
  return isFinite(parsed) ? parsed : 0
}

const OWNERSHIPS = new Set<string>(['OWNED', 'RENTED', 'OPERATOR_PROVIDED'] satisfies EquipmentOwnership[])
const CATEGORIES = new Set<string>([
  'EQUIPMENT',
  'LABOR',
  'MATERIAL',
  'SUBCONTRACT',
  'GENERAL_CONDITIONS',
  'OVERHEAD',
  'CONTINGENCY',
  'OTHER',
] satisfies CostCategory[])

const LABELS: Record<string, string> = {
  code: 'code',
  name: 'name',
  category: 'kind',
  ownership: 'ownership',
  hourlyRate: 'hourly rate',
  dailyRate: 'daily rate',
  weeklyRate: 'weekly rate',
  monthlyRate: 'monthly rate',
  operatingCostPerHour: 'operating cost per hour',
  standbyRatePerHour: 'standby rate per hour',
  hoursPerDay: 'hours in a working day',
  daysPerWeek: 'days in a working week',
  vendorId: 'hired from',
  assetTag: 'asset tag',
  costCategory: 'cost type',
  notes: 'notes',
  active: 'in use',
}

function fields(row: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(LABELS).map((key) => [key, row[key]]))
}

export async function saveEquipmentItem(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const ownership = String(formData.get('ownership') ?? 'OWNED')
  const costCategory = String(formData.get('costCategory') ?? 'EQUIPMENT')

  if (!name) return { error: 'Name the machine, for example "Excavator, 30 tonne".' }
  if (!OWNERSHIPS.has(ownership)) return { error: 'Say whether it is owned, hired or brought by the operator.' }
  if (!CATEGORIES.has(costCategory)) return { error: 'Choose the cost type it lands in.' }

  const rates = {
    hourlyRate: money(formData.get('hourlyRate')),
    dailyRate: money(formData.get('dailyRate')),
    weeklyRate: money(formData.get('weeklyRate')),
    monthlyRate: money(formData.get('monthlyRate')),
    operatingCostPerHour: money(formData.get('operatingCostPerHour')),
    standbyRatePerHour: money(formData.get('standbyRatePerHour')),
  }
  for (const [key, value] of Object.entries(rates)) {
    if (value < 0) return { error: `The ${LABELS[key] ?? key} cannot be negative.` }
  }

  const hoursPerDay = money(formData.get('hoursPerDay')) || 8
  const daysPerWeek = money(formData.get('daysPerWeek')) || 5
  if (hoursPerDay <= 0 || hoursPerDay > 24) return { error: 'A working day is between 0 and 24 hours.' }
  if (daysPerWeek <= 0 || daysPerWeek > 7) return { error: 'A working week is between 0 and 7 days.' }

  const vendorId = text(formData.get('vendorId'))
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, companyId: user.companyId },
      select: { id: true },
    })
    if (!vendor) return { error: 'That supplier is not on this account.' }
  }

  const clash = await prisma.equipmentItem.findFirst({
    where: { companyId: user.companyId, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `There is already a piece of equipment called ${name}.` }

  const values = {
    code: text(formData.get('code')),
    name,
    category: text(formData.get('category')),
    ownership: ownership as EquipmentOwnership,
    ...rates,
    hoursPerDay,
    daysPerWeek,
    vendorId: vendorId ?? null,
    assetTag: text(formData.get('assetTag')),
    costCategory: costCategory as CostCategory,
    notes: text(formData.get('notes')),
    active: String(formData.get('active') ?? 'on') === 'on',
  }

  if (id) {
    const existing = await prisma.equipmentItem.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) return { error: 'That equipment is not on this account.' }

    const updated = await prisma.equipmentItem.update({ where: { id }, data: values })
    await recordFieldChanges({
      actor: user,
      entity: 'EquipmentItem',
      entityId: id,
      entityLabel: name,
      before: fields(existing as unknown as Record<string, unknown>),
      after: fields(updated as unknown as Record<string, unknown>),
      labels: LABELS,
    })
  } else {
    const last = await prisma.equipmentItem.findFirst({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.equipmentItem.create({
      data: { ...values, companyId: user.companyId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'EquipmentItem',
      entityId: created.id,
      entityLabel: name,
      action: 'CREATE',
      summary: `${name} added to the equipment list`,
    })
  }

  revalidatePath('/admin/equipment')
  return {}
}

export async function deleteEquipmentItem(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id'))
  const item = await prisma.equipmentItem.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { assignments: true } } },
  })
  if (!item) return { error: 'That equipment is not on this account.' }
  if (item._count.assignments > 0) {
    return {
      error: `${item.name} is charged to ${item._count.assignments} ${item._count.assignments === 1 ? 'job' : 'jobs'}. Mark it out of use instead, so what it already priced is not disturbed.`,
    }
  }

  await prisma.equipmentItem.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'EquipmentItem',
    entityId: id,
    entityLabel: item.name,
    action: 'DELETE',
    summary: `${item.name} removed from the equipment list`,
  })

  revalidatePath('/admin/equipment')
  return {}
}
