'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Logs a subcontractor invoice and posts the matching cost transaction, so a
 * sub pay application only ever needs entering once.
 */
export async function createSubInvoice(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:sub_billing')

  const projectId = String(formData.get('projectId'))
  const commitmentId = String(formData.get('commitmentId'))
  const invoiceNumber = String(formData.get('invoiceNumber') ?? '').trim()
  const amount = Number(formData.get('amount'))
  const costCodeId = String(formData.get('costCodeId') ?? '')

  if (!commitmentId) return { error: 'Choose the subcontract this invoice bills against.' }
  if (!invoiceNumber) return { error: 'Enter the invoice number.' }
  if (!isFinite(amount) || amount <= 0) return { error: 'Enter an invoice amount greater than zero.' }

  const commitment = await prisma.commitment.findFirst({
    where: { id: commitmentId, projectId, project: { companyId: user.companyId } },
    include: { vendor: true, lines: true, invoices: true, changes: true },
  })
  if (!commitment) return { error: 'Subcontract not found on this project.' }

  const duplicate = commitment.invoices.find((i) => i.invoiceNumber === invoiceNumber)
  if (duplicate) return { error: `Invoice ${invoiceNumber} has already been logged against this subcontract.` }

  // Guard against invoicing past the current contract value.
  const approvedChanges = commitment.changes.filter((c) => c.status === 'APPROVED').reduce((a, c) => a + c.amount, 0)
  const currentValue = commitment.originalAmount + approvedChanges
  const alreadyInvoiced = commitment.invoices.reduce((a, i) => a + i.amount, 0)
  if (alreadyInvoiced + amount > currentValue + 0.005) {
    return {
      error: `This would invoice ${(alreadyInvoiced + amount).toFixed(0)} against a contract value of ${currentValue.toFixed(0)}. Raise a subcontract change order first.`,
    }
  }

  const targetCostCodeId = costCodeId || commitment.lines[0]?.costCodeId
  if (!targetCostCodeId) return { error: 'This subcontract has no line item to charge.' }

  const retentionPct = Number(formData.get('retentionPct'))
  const periodEnd = parseDate(formData.get('periodEnd'))

  const invoice = await prisma.subInvoice.create({
    data: {
      projectId,
      commitmentId,
      vendorId: commitment.vendorId,
      costCodeId: targetCostCodeId,
      invoiceNumber,
      periodEnd,
      amount,
      retentionPct: isFinite(retentionPct) ? retentionPct : commitment.retentionPct,
      dateReceived: parseDate(formData.get('dateReceived')) ?? new Date(),
      lienWaiverReceived: formData.get('lienWaiverReceived') === 'on',
      attachmentName: String(formData.get('attachmentName') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
    },
  })

  // The invoice is the cost: post it once, here.
  await prisma.costTransaction.create({
    data: {
      projectId,
      costCodeId: targetCostCodeId,
      date: periodEnd ?? new Date(),
      type: 'ACTUAL',
      source: 'SUB_INVOICE',
      vendorId: commitment.vendorId,
      commitmentId,
      subInvoiceId: invoice.id,
      description: `${commitment.vendor.name} invoice ${invoiceNumber}`,
      reference: invoiceNumber,
      amount,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'SubInvoice',
    entityId: invoice.id,
    action: 'CREATE',
    summary: `Logged ${commitment.vendor.name} invoice ${invoiceNumber} for ${amount}`,
  })

  revalidatePath(`/projects/${projectId}/subs`)
  revalidatePath(`/projects/${projectId}/costs`)
  revalidatePath(`/projects/${projectId}`)
  return {}
}

export async function approveSubInvoice(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:sub_billing')

  const invoiceId = String(formData.get('invoiceId'))
  const invoice = await prisma.subInvoice.findFirst({
    where: { id: invoiceId, project: { companyId: user.companyId } },
  })
  if (!invoice) return

  await prisma.subInvoice.update({ where: { id: invoiceId }, data: { approved: true, dateApproved: new Date() } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'SubInvoice',
    entityId: invoiceId,
    action: 'APPROVE',
    summary: `Approved invoice ${invoice.invoiceNumber}`,
  })

  revalidatePath(`/projects/${invoice.projectId}/subs`)
}

/** Pays an invoice, refusing while the vendor is on a compliance hold. */
export async function paySubInvoice(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:sub_billing')

  const invoiceId = String(formData.get('invoiceId'))
  const amount = Number(formData.get('amount'))

  const invoice = await prisma.subInvoice.findFirst({
    where: { id: invoiceId, project: { companyId: user.companyId } },
    include: { vendor: true },
  })
  if (!invoice || !isFinite(amount) || amount <= 0) return
  if (invoice.vendor.paymentHold) return

  await prisma.subInvoice.update({
    where: { id: invoiceId },
    data: { amountPaid: invoice.amountPaid + amount, datePaid: new Date() },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'SubInvoice',
    entityId: invoiceId,
    action: 'PAY',
    summary: `Paid ${amount} on invoice ${invoice.invoiceNumber} to ${invoice.vendor.name}`,
  })

  revalidatePath(`/projects/${invoice.projectId}/subs`)
  revalidatePath(`/projects/${invoice.projectId}`)
}

export async function toggleVendorHold(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:sub_billing')

  const vendorId = String(formData.get('vendorId'))
  const projectId = String(formData.get('projectId'))
  const hold = String(formData.get('hold')) === 'true'

  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId: user.companyId } })
  if (!vendor) return

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { paymentHold: hold, paymentHoldReason: hold ? 'Compliance hold placed from the project subcontractor page' : null },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Vendor',
    entityId: vendorId,
    action: hold ? 'HOLD' : 'RELEASE',
    summary: `${hold ? 'Placed' : 'Released'} payment hold on ${vendor.name}`,
  })

  revalidatePath(`/projects/${projectId}/subs`)
}
