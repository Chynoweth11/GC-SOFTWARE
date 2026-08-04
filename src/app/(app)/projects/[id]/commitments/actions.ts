'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { CommitmentType, CommitmentStatus } from '@/generated/prisma/client'

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

export async function createCommitment(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:commitments')

  const projectId = String(formData.get('projectId'))
  const vendorId = String(formData.get('vendorId'))
  const costCodeId = String(formData.get('costCodeId'))
  const number = String(formData.get('number') ?? '').trim()
  const amount = Number(formData.get('originalAmount'))

  if (!vendorId) return { error: 'Choose a vendor or subcontractor.' }
  if (!costCodeId) return { error: 'Choose the line item this commitment charges.' }
  if (!number) return { error: 'Enter a contract or purchase-order number.' }
  if (!isFinite(amount) || amount <= 0) return { error: 'Enter a commitment value greater than zero.' }

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return { error: 'Project not found.' }

  const duplicate = await prisma.commitment.findFirst({ where: { projectId, number } })
  if (duplicate) return { error: `Commitment ${number} already exists on this project.` }

  const budgetLine = await prisma.budgetLine.findFirst({ where: { projectId, costCodeId } })
  if (!budgetLine) {
    return { error: 'That line item has no budget line on this project. Add it to the budget before committing against it.' }
  }

  const commitment = await prisma.commitment.create({
    data: {
      projectId,
      vendorId,
      type: String(formData.get('type') ?? 'SUBCONTRACT') as CommitmentType,
      number,
      description: String(formData.get('description') ?? '') || null,
      scopeOfWork: String(formData.get('scopeOfWork') ?? '') || null,
      originalAmount: amount,
      retentionPct: Number(formData.get('retentionPct')) || 0,
      status: String(formData.get('status') ?? 'ISSUED') as CommitmentStatus,
      dateIssued: parseDate(formData.get('dateIssued')),
      expectedDelivery: parseDate(formData.get('expectedDelivery')),
      lines: { create: [{ costCodeId, amount }] },
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Commitment',
    entityId: commitment.id,
    action: 'CREATE',
    summary: `Created commitment ${number} for ${amount}`,
  })

  revalidatePath(`/projects/${projectId}/commitments`)
  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/**
 * Posts a change against an existing commitment. Approved changes raise the
 * committed value on the affected line items automatically, because the engine
 * derives the current value from original plus approved changes.
 */
export async function addCommitmentChange(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:commitments')

  const commitmentId = String(formData.get('commitmentId'))
  const number = String(formData.get('changeNumber') ?? '').trim()
  const description = String(formData.get('changeDescription') ?? '').trim()
  const amount = Number(formData.get('changeAmount'))
  const status = String(formData.get('changeStatus') ?? 'PENDING')

  if (!commitmentId) return { error: 'Choose the commitment to change.' }
  if (!number) return { error: 'Enter a change number.' }
  if (!description) return { error: 'Describe the change.' }
  if (!isFinite(amount) || amount === 0) return { error: 'Enter a change amount.' }

  const commitment = await prisma.commitment.findFirst({
    where: { id: commitmentId, project: { companyId: user.companyId } },
  })
  if (!commitment) return { error: 'Commitment not found.' }

  await prisma.commitmentChange.create({
    data: {
      commitmentId,
      number,
      description,
      amount,
      status: status as 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'VOID',
      dateSubmitted: status === 'PENDING' ? null : new Date(),
      dateApproved: status === 'APPROVED' ? new Date() : null,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Commitment',
    entityId: commitmentId,
    action: 'CHANGE',
    summary: `Added ${status.toLowerCase()} change ${number} of ${amount}, ${description}`,
  })

  revalidatePath(`/projects/${commitment.projectId}/commitments`)
  revalidatePath(`/projects/${commitment.projectId}`)
  return {}
}
