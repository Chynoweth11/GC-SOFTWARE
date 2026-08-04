'use server'

import { revalidatePath } from 'next/cache'
import { requireUser, hashPassword } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { CostCategory, Role } from '@/generated/prisma/client'

// ── Company defaults ──────────────────────────────────────────────────────

export async function updateCompany(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:company_settings')

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Company name is required.' }

  const pct = (key: string) => {
    const value = Number(formData.get(key))
    return isFinite(value) && value >= 0 && value <= 1 ? value : 0
  }

  const before = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })

  await prisma.company.update({
    where: { id: user.companyId },
    data: {
      name,
      legalName: String(formData.get('legalName') ?? '') || null,
      address: String(formData.get('address') ?? '') || null,
      city: String(formData.get('city') ?? '') || null,
      state: String(formData.get('state') ?? '') || null,
      phone: String(formData.get('phone') ?? '') || null,
      fiscalYearStartMonth: Math.max(1, Math.min(12, Number(formData.get('fiscalYearStartMonth')) || 1)),
      targetMarginPct: pct('targetMarginPct'),
      defaultRetentionPct: pct('defaultRetentionPct'),
      defaultLaborBurdenPct: pct('defaultLaborBurdenPct'),
      defaultOverheadPct: pct('defaultOverheadPct'),
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Company',
    entityId: user.companyId,
    action: 'UPDATE',
    oldValue: `target margin ${before.targetMarginPct}`,
    newValue: `target margin ${pct('targetMarginPct')}`,
    summary: 'Company defaults updated',
  })

  revalidatePath('/admin')
  revalidatePath('/')
  return {}
}

// ── Users ─────────────────────────────────────────────────────────────────

export async function createUser(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:users')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const role = String(formData.get('role') ?? 'READ_ONLY') as Role

  if (!email || !email.includes('@')) return { error: 'Enter a valid email address.' }
  if (!name) return { error: 'Enter the person’s name.' }
  if (password.length < 8) return { error: 'The password must be at least 8 characters.' }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: 'A user with that email already exists.' }

  const created = await prisma.user.create({
    data: { companyId: user.companyId, email, name, role, passwordHash: hashPassword(password) },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'User',
    entityId: created.id,
    action: 'CREATE',
    summary: `Added ${name} (${email}) as ${role}`,
  })

  revalidatePath('/admin/users')
  return {}
}

export async function updateUserRole(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'manage:users')

  const userId = String(formData.get('userId'))
  const role = String(formData.get('role')) as Role

  const target = await prisma.user.findFirst({ where: { id: userId, companyId: user.companyId } })
  if (!target || target.role === role) return

  // The last owner must keep their role, or nobody can administer the company.
  if (target.role === 'OWNER' && role !== 'OWNER') {
    const owners = await prisma.user.count({ where: { companyId: user.companyId, role: 'OWNER', active: true } })
    if (owners <= 1) return
  }

  await prisma.user.update({ where: { id: userId }, data: { role } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'User',
    entityId: userId,
    action: 'ROLE',
    field: 'role',
    oldValue: target.role,
    newValue: role,
    summary: `${target.name} changed from ${target.role} to ${role}`,
  })

  revalidatePath('/admin/users')
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'manage:users')

  const userId = String(formData.get('userId'))
  if (userId === user.id) return

  const target = await prisma.user.findFirst({ where: { id: userId, companyId: user.companyId } })
  if (!target) return

  if (target.active && target.role === 'OWNER') {
    const owners = await prisma.user.count({ where: { companyId: user.companyId, role: 'OWNER', active: true } })
    if (owners <= 1) return
  }

  await prisma.user.update({ where: { id: userId }, data: { active: !target.active } })
  if (target.active) await prisma.session.deleteMany({ where: { userId } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'User',
    entityId: userId,
    action: target.active ? 'DEACTIVATE' : 'ACTIVATE',
    summary: `${target.name} ${target.active ? 'deactivated, sessions revoked' : 'reactivated'}`,
  })

  revalidatePath('/admin/users')
}

// ── Cost codes ────────────────────────────────────────────────────────────

export async function saveCostCode(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const costCodeId = String(formData.get('costCodeId') ?? '')
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  const description = String(formData.get('description') ?? '').trim()
  const category = String(formData.get('category') ?? 'OTHER') as CostCategory

  if (!code) return { error: 'Enter a cost code.' }
  if (!description) return { error: 'Enter a description.' }

  const clash = await prisma.costCode.findFirst({ where: { companyId: user.companyId, code } })
  if (clash && clash.id !== costCodeId) return { error: `Cost code ${code} already exists.` }

  const data = {
    companyId: user.companyId,
    code,
    description,
    category,
    divisionId: String(formData.get('divisionId') ?? '') || null,
    tradeId: String(formData.get('tradeId') ?? '') || null,
    regionId: String(formData.get('regionId') ?? '') || null,
  }

  if (costCodeId) await prisma.costCode.update({ where: { id: costCodeId }, data })
  else {
    const count = await prisma.costCode.count({ where: { companyId: user.companyId } })
    await prisma.costCode.create({ data: { ...data, sortOrder: count } })
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'CostCode',
    entityId: costCodeId || code,
    action: costCodeId ? 'UPDATE' : 'CREATE',
    summary: `${costCodeId ? 'Updated' : 'Added'} cost code ${code}, ${description}`,
  })

  revalidatePath('/admin/cost-codes')
  return {}
}

/**
 * Retires a cost code rather than deleting it. Budget lines, commitments and
 * posted cost all reference it; deleting would orphan financial history.
 */
export async function toggleCostCodeActive(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const costCodeId = String(formData.get('costCodeId'))
  const code = await prisma.costCode.findFirst({ where: { id: costCodeId, companyId: user.companyId } })
  if (!code) return

  await prisma.costCode.update({ where: { id: costCodeId }, data: { active: !code.active } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'CostCode',
    entityId: costCodeId,
    action: code.active ? 'RETIRE' : 'REINSTATE',
    summary: `${code.code} ${code.active ? 'retired, existing history is unaffected' : 'reinstated'}`,
  })

  revalidatePath('/admin/cost-codes')
}

// ── Trades and divisions ──────────────────────────────────────────────────

export async function saveTrade(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const tradeId = String(formData.get('tradeId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Enter a trade name.' }

  const clash = await prisma.trade.findFirst({ where: { companyId: user.companyId, name } })
  if (clash && clash.id !== tradeId) return { error: `A trade called "${name}" already exists.` }

  const data = {
    companyId: user.companyId,
    name,
    divisionId: String(formData.get('divisionId') ?? '') || null,
  }

  if (tradeId) await prisma.trade.update({ where: { id: tradeId }, data })
  else {
    const count = await prisma.trade.count({ where: { companyId: user.companyId } })
    await prisma.trade.create({ data: { ...data, sortOrder: count } })
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Trade',
    entityId: tradeId || name,
    action: tradeId ? 'UPDATE' : 'CREATE',
    summary: `${tradeId ? 'Renamed' : 'Added'} trade "${name}"`,
  })

  revalidatePath('/admin/trades')
  return {}
}

export async function toggleTradeActive(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const tradeId = String(formData.get('tradeId'))
  const trade = await prisma.trade.findFirst({ where: { id: tradeId, companyId: user.companyId } })
  if (!trade) return

  await prisma.trade.update({ where: { id: tradeId }, data: { active: !trade.active } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Trade',
    entityId: tradeId,
    action: trade.active ? 'RETIRE' : 'REINSTATE',
    summary: `Trade "${trade.name}" ${trade.active ? 'retired' : 'reinstated'}`,
  })

  revalidatePath('/admin/trades')
}

export async function saveDivision(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const divisionId = String(formData.get('divisionId') ?? '')
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!code) return { error: 'Enter a division code.' }
  if (!name) return { error: 'Enter a division name.' }

  const clash = await prisma.csiDivision.findFirst({ where: { companyId: user.companyId, code } })
  if (clash && clash.id !== divisionId) return { error: `Division ${code} already exists.` }

  if (divisionId) await prisma.csiDivision.update({ where: { id: divisionId }, data: { code, name } })
  else {
    const count = await prisma.csiDivision.count({ where: { companyId: user.companyId } })
    await prisma.csiDivision.create({ data: { companyId: user.companyId, code, name, sortOrder: count } })
  }

  revalidatePath('/admin/trades')
  return {}
}

// ── Vendors ───────────────────────────────────────────────────────────────

export async function saveVendor(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const vendorId = String(formData.get('vendorId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Enter the vendor name.' }

  const clash = await prisma.vendor.findFirst({ where: { companyId: user.companyId, name } })
  if (clash && clash.id !== vendorId) return { error: `A vendor called "${name}" already exists.` }

  const parseDate = (key: string) => {
    const raw = String(formData.get(key) ?? '')
    if (!raw) return null
    const parsed = new Date(`${raw}T00:00:00.000Z`)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  const data = {
    companyId: user.companyId,
    name,
    isSubcontractor: formData.get('isSubcontractor') === 'on',
    tradeId: String(formData.get('tradeId') ?? '') || null,
    regionId: String(formData.get('regionId') ?? '') || null,
    contactName: String(formData.get('contactName') ?? '') || null,
    phone: String(formData.get('phone') ?? '') || null,
    email: String(formData.get('email') ?? '') || null,
    address: String(formData.get('address') ?? '') || null,
    w9OnFile: formData.get('w9OnFile') === 'on',
    glExpiration: parseDate('glExpiration'),
    wcExpiration: parseDate('wcExpiration'),
    autoExpiration: parseDate('autoExpiration'),
    umbrellaExpiration: parseDate('umbrellaExpiration'),
  }

  // The state follows from the region, so it is never set inconsistently.
  const regionId = data.regionId
  const stateId = regionId
    ? (await prisma.vendorRegion.findFirst({ where: { id: regionId, companyId: user.companyId } }))?.stateId ?? null
    : null
  const record = { ...data, stateId }

  if (vendorId) await prisma.vendor.update({ where: { id: vendorId }, data: record })
  else await prisma.vendor.create({ data: record })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Vendor',
    entityId: vendorId || name,
    action: vendorId ? 'UPDATE' : 'CREATE',
    summary: `${vendorId ? 'Updated' : 'Added'} vendor "${name}"`,
  })

  revalidatePath('/admin/vendors')
  return {}
}

/** Archives a vendor, or brings one back. Archived vendors stay on their history. */
export async function setVendorActive(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id') ?? '')
  const active = formData.get('active') === 'true'

  const vendor = await prisma.vendor.findFirst({ where: { id, companyId: user.companyId } })
  if (!vendor) return { error: 'That vendor no longer exists.' }

  await prisma.vendor.update({ where: { id }, data: { active } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Vendor',
    entityId: id,
    entityLabel: vendor.name,
    action: active ? 'RESTORE' : 'ARCHIVE',
    field: 'Active',
    oldValue: String(vendor.active),
    newValue: String(active),
    summary: active ? `Restored the vendor ${vendor.name}` : `Archived the vendor ${vendor.name}`,
  })

  revalidatePath('/admin/vendors')
  return {}
}

/**
 * Deletes a vendor that was never used.
 *
 * A vendor named on a commitment or an invoice is part of the payment record and
 * is archived instead, so a subcontract never loses the name of who held it.
 */
export async function deleteVendor(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')
  assertCan(user.role, 'delete:records')

  const id = String(formData.get('id') ?? '')
  const vendor = await prisma.vendor.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { commitments: true, invoices: true, costTx: true, quotes: true } } },
  })
  if (!vendor) return { error: 'That vendor no longer exists.' }

  const { commitments, invoices, costTx, quotes } = vendor._count
  const used: string[] = []
  if (commitments > 0) used.push(`${commitments} commitment${commitments === 1 ? '' : 's'}`)
  if (invoices > 0) used.push(`${invoices} invoice${invoices === 1 ? '' : 's'}`)
  if (costTx > 0) used.push(`${costTx} cost transaction${costTx === 1 ? '' : 's'}`)
  if (quotes > 0) used.push(`${quotes} quote${quotes === 1 ? '' : 's'}`)

  if (used.length > 0) {
    return { error: `${vendor.name} is named on ${used.join(', ')} and cannot be deleted. Archive it instead.` }
  }

  await prisma.vendor.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Vendor',
    entityId: id,
    entityLabel: vendor.name,
    action: 'DELETE',
    oldValue: vendor.name,
    summary: `Deleted the vendor ${vendor.name}, which had no commitments, invoices or quotes`,
  })

  revalidatePath('/admin/vendors')
  return {}
}
