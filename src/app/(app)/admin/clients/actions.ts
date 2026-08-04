'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'
import type { ClientType } from '@/generated/prisma/client'

/**
 * Clients.
 *
 * Deleting is allowed only while a client has no projects and no bids. Once it
 * does, the record is archived instead: erasing it would strip the owner's name
 * off contracts and pay applications that have already been issued. Either way
 * the audit history keeps the full account of what happened.
 */

const CLIENT_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'PUBLIC', 'DEVELOPER', 'INSTITUTIONAL', 'OTHER'] as const

function readForm(formData: FormData) {
  const text = (key: string) => String(formData.get(key) ?? '').trim()
  const type = text('type')
  return {
    name: text('name'),
    type: ((CLIENT_TYPES as readonly string[]).includes(type) ? type : 'OTHER') as ClientType,
    contact: text('contact') || null,
    phone: text('phone') || null,
    email: text('email') || null,
    address: text('address') || null,
    notes: text('notes') || null,
  }
}

const LABELS: Record<string, string> = {
  name: 'Name',
  type: 'Type',
  contact: 'Contact',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  notes: 'Notes',
  active: 'Active',
}

export async function saveClient(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:clients')

  const id = String(formData.get('id') ?? '')
  const values = readForm(formData)
  if (!values.name) return { error: 'A client needs a name.' }

  const clash = await prisma.client.findFirst({
    where: { companyId: user.companyId, name: values.name, ...(id ? { NOT: { id } } : {}) },
  })
  if (clash) return { error: `There is already a client called ${values.name}.` }

  if (id) {
    const before = await prisma.client.findFirst({ where: { id, companyId: user.companyId } })
    if (!before) return { error: 'That client no longer exists.' }
    const after = await prisma.client.update({ where: { id }, data: values })
    await recordFieldChanges({
      actor: user,
      entity: 'Client',
      entityId: id,
      entityLabel: after.name,
      before,
      after,
      labels: LABELS,
    })
  } else {
    const created = await prisma.client.create({ data: { companyId: user.companyId, ...values } })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'Client',
      entityId: created.id,
      entityLabel: created.name,
      action: 'CREATE',
      summary: `Added the client ${created.name}`,
    })
  }

  revalidatePath('/admin/clients')
  return {}
}

export async function setClientActive(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:clients')

  const id = String(formData.get('id') ?? '')
  const active = formData.get('active') === 'true'

  const client = await prisma.client.findFirst({ where: { id, companyId: user.companyId } })
  if (!client) return { error: 'That client no longer exists.' }

  await prisma.client.update({ where: { id }, data: { active } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Client',
    entityId: id,
    entityLabel: client.name,
    action: active ? 'RESTORE' : 'ARCHIVE',
    field: 'Active',
    oldValue: String(client.active),
    newValue: String(active),
    summary: active ? `Restored the client ${client.name}` : `Archived the client ${client.name}`,
  })

  revalidatePath('/admin/clients')
  return {}
}

export async function deleteClient(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'manage:clients')
  assertCan(user.role, 'delete:records')

  const id = String(formData.get('id') ?? '')
  const client = await prisma.client.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { projects: true, bids: true } } },
  })
  if (!client) return { error: 'That client no longer exists.' }

  const { projects, bids } = client._count
  if (projects > 0 || bids > 0) {
    const parts = [
      projects > 0 ? `${projects} project${projects === 1 ? '' : 's'}` : '',
      bids > 0 ? `${bids} bid${bids === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    return {
      error: `${client.name} is used by ${parts.join(' and ')}, so it cannot be deleted. Archive it instead and the history stays intact.`,
    }
  }

  await prisma.client.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Client',
    entityId: id,
    entityLabel: client.name,
    action: 'DELETE',
    oldValue: client.name,
    summary: `Deleted the client ${client.name}, which had no projects or bids`,
  })

  revalidatePath('/admin/clients')
  return {}
}
