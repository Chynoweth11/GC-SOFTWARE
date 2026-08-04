'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

/**
 * States and the regions inside them.
 *
 * Regions are the company's own working areas, not a fixed list, so they can be
 * named the way the business already talks about them. A state or region that
 * still has vendors in it is never removed silently: the vendors are moved out
 * first, or the deletion is refused.
 */

export async function saveVendorState(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim().toUpperCase() || null
  if (!name) return { error: 'A state needs a name.' }

  const clash = await prisma.vendorState.findFirst({
    where: { companyId: user.companyId, name, ...(id ? { NOT: { id } } : {}) },
  })
  if (clash) return { error: `${name} is already on the list.` }

  if (id) {
    const before = await prisma.vendorState.findFirst({ where: { id, companyId: user.companyId } })
    if (!before) return { error: 'That state no longer exists.' }
    await prisma.vendorState.update({ where: { id }, data: { name, code } })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'VendorState',
      entityId: id,
      entityLabel: name,
      action: 'UPDATE',
      field: 'Name',
      oldValue: before.name,
      newValue: name,
      summary: before.name === name ? `Updated the state ${name}` : `Renamed the state ${before.name} to ${name}`,
    })
  } else {
    const count = await prisma.vendorState.count({ where: { companyId: user.companyId } })
    const created = await prisma.vendorState.create({
      data: { companyId: user.companyId, name, code, sortOrder: count },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'VendorState',
      entityId: created.id,
      entityLabel: name,
      action: 'CREATE',
      newValue: name,
      summary: `Added the state ${name}`,
    })
  }

  revalidatePath('/admin/vendors')
  return {}
}

export async function deleteVendorState(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id') ?? '')
  const state = await prisma.vendorState.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { vendors: true, regions: true } } },
  })
  if (!state) return { error: 'That state no longer exists.' }

  if (state._count.vendors > 0) {
    return {
      error: `${state.name} still has ${state._count.vendors} vendor${state._count.vendors === 1 ? '' : 's'} assigned to it. Move them first.`,
    }
  }

  await prisma.vendorState.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'VendorState',
    entityId: id,
    entityLabel: state.name,
    action: 'DELETE',
    oldValue: state.name,
    summary: `Deleted the state ${state.name} and its ${state._count.regions} region${state._count.regions === 1 ? '' : 's'}`,
  })

  revalidatePath('/admin/vendors')
  return {}
}

export async function saveVendorRegion(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id') ?? '')
  const stateId = String(formData.get('stateId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  if (!name) return { error: 'A region needs a name.' }
  if (!stateId) return { error: 'Choose the state this region belongs to.' }

  const state = await prisma.vendorState.findFirst({ where: { id: stateId, companyId: user.companyId } })
  if (!state) return { error: 'That state no longer exists.' }

  const clash = await prisma.vendorRegion.findFirst({
    where: { stateId, name, ...(id ? { NOT: { id } } : {}) },
  })
  if (clash) return { error: `${state.name} already has a region called ${name}.` }

  if (id) {
    const before = await prisma.vendorRegion.findFirst({ where: { id, companyId: user.companyId } })
    if (!before) return { error: 'That region no longer exists.' }
    await prisma.vendorRegion.update({ where: { id }, data: { name, notes, stateId } })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'VendorRegion',
      entityId: id,
      entityLabel: `${state.name} / ${name}`,
      action: 'UPDATE',
      field: 'Name',
      oldValue: before.name,
      newValue: name,
      summary: before.name === name ? `Updated the region ${name}` : `Renamed the region ${before.name} to ${name}`,
    })
  } else {
    const count = await prisma.vendorRegion.count({ where: { stateId } })
    const created = await prisma.vendorRegion.create({
      data: { companyId: user.companyId, stateId, name, notes, sortOrder: count },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'VendorRegion',
      entityId: created.id,
      entityLabel: `${state.name} / ${name}`,
      action: 'CREATE',
      newValue: name,
      summary: `Added the region ${name} to ${state.name}`,
    })
  }

  revalidatePath('/admin/vendors')
  return {}
}

export async function deleteVendorRegion(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const id = String(formData.get('id') ?? '')
  const region = await prisma.vendorRegion.findFirst({
    where: { id, companyId: user.companyId },
    include: { state: true, _count: { select: { vendors: true } } },
  })
  if (!region) return { error: 'That region no longer exists.' }

  if (region._count.vendors > 0) {
    return {
      error: `${region.name} still has ${region._count.vendors} vendor${region._count.vendors === 1 ? '' : 's'} in it. Move them first.`,
    }
  }

  await prisma.vendorRegion.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'VendorRegion',
    entityId: id,
    entityLabel: `${region.state.name} / ${region.name}`,
    action: 'DELETE',
    oldValue: region.name,
    summary: `Deleted the region ${region.name} from ${region.state.name}`,
  })

  revalidatePath('/admin/vendors')
  return {}
}

/** Places a vendor in a state and region, or clears the assignment. */
export async function assignVendorRegion(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:reference_data')

  const vendorId = String(formData.get('vendorId') ?? '')
  const regionId = String(formData.get('regionId') ?? '') || null

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, companyId: user.companyId },
    include: { state: true, region: true },
  })
  if (!vendor) return { error: 'That vendor no longer exists.' }

  let stateId: string | null = null
  let label = 'Unassigned'
  if (regionId) {
    const region = await prisma.vendorRegion.findFirst({
      where: { id: regionId, companyId: user.companyId },
      include: { state: true },
    })
    if (!region) return { error: 'That region no longer exists.' }
    stateId = region.stateId
    label = `${region.state.name} / ${region.name}`
  }

  await prisma.vendor.update({ where: { id: vendorId }, data: { stateId, regionId } })

  const previous = vendor.region ? `${vendor.state?.name ?? ''} / ${vendor.region.name}`.trim() : 'Unassigned'
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Vendor',
    entityId: vendorId,
    entityLabel: vendor.name,
    action: 'UPDATE',
    field: 'Region',
    oldValue: previous,
    newValue: label,
    summary: `Moved ${vendor.name} from ${previous} to ${label}`,
  })

  revalidatePath('/admin/vendors')
  return {}
}
