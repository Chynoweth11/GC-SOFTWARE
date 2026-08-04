'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { BidStatus, ClientType } from '@/generated/prisma/client'

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

export async function createBid(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:pipeline')

  const number = String(formData.get('number') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!number) return { error: 'Enter a bid number.' }
  if (!name) return { error: 'Enter the opportunity name.' }

  const clash = await prisma.bid.findFirst({ where: { companyId: user.companyId, number } })
  if (clash) return { error: `Bid ${number} already exists.` }

  const bid = await prisma.bid.create({
    data: {
      companyId: user.companyId,
      number,
      name,
      clientId: String(formData.get('clientId') ?? '') || null,
      clientContact: String(formData.get('clientContact') ?? '') || null,
      clientPhone: String(formData.get('clientPhone') ?? '') || null,
      clientType: (String(formData.get('clientType') ?? 'OTHER')) as ClientType,
      leadSource: String(formData.get('leadSource') ?? '') || null,
      location: String(formData.get('location') ?? '') || null,
      estimator: String(formData.get('estimator') ?? '') || null,
      dateReceived: parseDate(formData.get('dateReceived')) ?? new Date(),
      bidDue: parseDate(formData.get('bidDue')),
      estimatedValue: Number(formData.get('estimatedValue')) || 0,
      status: (String(formData.get('status') ?? 'LEAD')) as BidStatus,
      winProbability: Math.max(0, Math.min(1, Number(formData.get('winProbability')) || 0)),
      nextFollowUp: parseDate(formData.get('nextFollowUp')),
      nextAction: String(formData.get('nextAction') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Bid',
    entityId: bid.id,
    action: 'CREATE',
    summary: `Added opportunity ${number}, ${name}`,
  })

  revalidatePath('/pipeline')
  revalidatePath('/')
  return {}
}

export async function updateBidStatus(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:pipeline')

  const bidId = String(formData.get('bidId'))
  const status = String(formData.get('status')) as BidStatus

  const bid = await prisma.bid.findFirst({ where: { id: bidId, companyId: user.companyId } })
  if (!bid || bid.status === status) return

  const closed = ['WON', 'LOST', 'NO_BID', 'WITHDRAWN'].includes(status)

  await prisma.bid.update({
    where: { id: bidId },
    data: {
      status,
      decisionDate: closed ? (bid.decisionDate ?? new Date()) : null,
      winProbability: status === 'WON' ? 1 : ['LOST', 'NO_BID', 'WITHDRAWN'].includes(status) ? 0 : bid.winProbability,
      nextFollowUp: closed ? null : bid.nextFollowUp,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Bid',
    entityId: bidId,
    action: 'STATUS',
    field: 'status',
    oldValue: bid.status,
    newValue: status,
    summary: `${bid.number} moved from ${bid.status} to ${status}`,
  })

  revalidatePath('/pipeline')
  revalidatePath('/')
}

/** Logs a contact and pushes the next follow-up a week out: the daily habit. */
export async function logTouch(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:pipeline')

  const bidId = String(formData.get('bidId'))
  const bid = await prisma.bid.findFirst({ where: { id: bidId, companyId: user.companyId } })
  if (!bid) return

  const now = new Date()
  await prisma.bid.update({
    where: { id: bidId },
    data: {
      touches: bid.touches + 1,
      lastContact: now,
      nextFollowUp: new Date(now.getTime() + 7 * 86_400_000),
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Bid',
    entityId: bidId,
    action: 'TOUCH',
    summary: `Logged a contact on ${bid.number}; next follow-up set for a week out`,
  })

  revalidatePath('/pipeline')
}
