'use server'

import { revalidatePath } from 'next/cache'
import { requireUser, type SessionUser } from '@/lib/auth'
import { assertCan, can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit, recordFieldChanges } from '@/lib/audit'
import { getProjectDocument } from '@/lib/queries/documents'
import type {
  ChangeOrderType,
  CostCategory,
  DocumentAttachmentKind,
  DocumentKind,
  DocumentStatus,
  MeasureType,
  SignatureStatus,
} from '@/generated/prisma/client'

/**
 * Change orders, contracts, amendments and addendums.
 *
 * One rule runs through this whole file: an amount reaches the project's
 * official figures when, and only when, `approvedAt` is set. Setting it is a
 * separate action from every other edit, it demands a capability of its own, it
 * demands a typed certification, and it writes the certification, the approver
 * and the moment to the permanent history in the same breath.
 *
 * The corollary is enforced just as hard. Once a document is approved, its
 * money is in the contract value and in the budget, so nothing that would move
 * that money can be edited without first withdrawing the approval, which needs
 * a stronger capability again and a written reason.
 */

const APPROVAL_CERTIFICATION =
  'I certify, to the best of my knowledge, that this document has been executed by every required party, that I have reviewed the signed copy, and that the amount stated is correct and may be added to this project.'

/** The text a user is asked to agree to. Exported so the dialog cannot drift. */
export async function approvalCertificationText(): Promise<string> {
  return APPROVAL_CERTIFICATION
}

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function money(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''))
  return isFinite(parsed) ? parsed : 0
}

function optionalMoney(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').replace(/[$,\s]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  return isFinite(parsed) ? parsed : null
}

/** Entered as a percentage, stored as a fraction, converted once here. */
function pct(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/[%\s,]/g, ''))
  return isFinite(parsed) ? parsed / 100 : 0
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null
}

const DOCUMENT_KINDS = new Set<string>([
  'CHANGE_ORDER',
  'CONTRACT',
  'CONTRACT_AMENDMENT',
  'ADDENDUM',
  'TIME_AND_MATERIALS',
  'OWNER_CHANGE',
  'SUBCONTRACT_CHANGE',
  'OTHER',
] satisfies DocumentKind[])

const DOCUMENT_STATUSES = new Set<string>([
  'DRAFT',
  'INTERNAL_REVIEW',
  'READY_TO_SEND',
  'SENT_FOR_SIGNATURE',
  'PARTIALLY_SIGNED',
  'FULLY_SIGNED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'VOIDED',
  'SUPERSEDED',
] satisfies DocumentStatus[])

const MEASURES = new Set<string>([
  'EA', 'LF', 'SF', 'SY', 'CY', 'CF', 'TON', 'LB', 'HR', 'DAY', 'LS', 'ALLOWANCE',
] satisfies MeasureType[])

const CATEGORIES = new Set<string>([
  'LABOR', 'MATERIAL', 'EQUIPMENT', 'SUBCONTRACT', 'GENERAL_CONDITIONS', 'OVERHEAD', 'CONTINGENCY', 'OTHER',
] satisfies CostCategory[])

async function ownedDocument(id: string, companyId: string) {
  return prisma.changeOrder.findFirst({
    where: { id, project: { companyId } },
    include: { project: { select: { id: true, number: true } } },
  })
}

/**
 * The guard every edit that could move money passes through.
 *
 * An approved document's amount is already in the contract value, the budget
 * and every report built on them. Letting somebody quietly retype a line would
 * move all of that with no record of a decision, so it is refused outright:
 * withdraw the approval first, which is itself recorded.
 */
function refuseIfApproved(
  document: { approvedAt: Date | null; number: string },
  what: string,
): { error: string } | null {
  if (document.approvedAt === null) return null
  return {
    error: `${document.number} is approved, and its amount is already in this project's contract value and budget. Withdraw the approval before changing ${what}.`,
  }
}

/**
 * Posts, or removes, the budget revisions an approved document implies.
 *
 * The one place the approval turns into money in the budget. Approving raises
 * the budget on each line's cost code; withdrawing the approval reverses the
 * raise. Both movements stay in the budget's own revision history, so a line
 * that went up and came back down still shows both.
 */
async function syncBudgetForDocument(documentId: string, actor: SessionUser) {
  const { id: userId, companyId } = actor
  const document = await prisma.changeOrder.findUniqueOrThrow({
    where: { id: documentId },
    include: { lines: { include: { costCode: true } } },
  })

  const existing = await prisma.budgetRevision.findMany({ where: { changeOrderId: documentId } })
  const shouldPost = document.approvedAt !== null && document.postsToBudget

  if (!shouldPost) {
    if (existing.length > 0) {
      await prisma.budgetRevision.deleteMany({ where: { changeOrderId: documentId } })
      await recordAudit({
        companyId,
        userId,
        actor,
        entity: 'ChangeOrder',
        entityId: documentId,
        entityLabel: document.number,
        action: 'BUDGET_REVERSED',
        summary: `Reversed the budget impact of ${document.number}, which is no longer approved`,
      })
    }
    return
  }

  if (existing.length > 0) return // already posted

  // Priced live from the lines, through the same engine the page shows, so the
  // budget cannot be raised by an amount the document does not display.
  const priced = await getProjectDocument(documentId, companyId)
  if (!priced) return

  const byCostCode = new Map<string, number>()
  for (const line of priced.lines) {
    byCostCode.set(line.costCodeId, (byCostCode.get(line.costCodeId) ?? 0) + line.totalCost)
  }

  let posted = 0
  for (const [costCodeId, amount] of byCostCode) {
    if (Math.abs(amount) < 0.005) continue
    const budgetLine = await prisma.budgetLine.findFirst({
      where: { projectId: document.projectId, costCodeId },
    })
    if (!budgetLine) continue
    await prisma.budgetRevision.create({
      data: {
        projectId: document.projectId,
        budgetLineId: budgetLine.id,
        type: 'CHANGE_ORDER',
        amount,
        reason: `${document.number} approved, ${document.description}`,
        changeOrderId: documentId,
        createdBy: userId,
      },
    })
    posted++
  }

  await recordAudit({
    companyId,
    userId,
    actor,
    entity: 'ChangeOrder',
    entityId: documentId,
    entityLabel: document.number,
    action: 'BUDGET_POSTED',
    summary:
      posted > 0
        ? `Posted ${posted} budget revisions from ${document.number}, ${priced.costAmount.toFixed(2)} of cost`
        : `${document.number} was approved but matched no budget lines, so nothing posted to the budget`,
  })
}

function refresh(projectId: string, documentId?: string) {
  revalidatePath(`/projects/${projectId}/changes`)
  if (documentId) revalidatePath(`/projects/${projectId}/changes/${documentId}`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/budget`)
  revalidatePath('/')
}

// ── The document itself ───────────────────────────────────────────────────

const DOCUMENT_LABELS: Record<string, string> = {
  number: 'number',
  documentKind: 'kind',
  type: 'reason',
  description: 'description',
  origin: 'origin',
  counterparty: 'counterparty',
  reference: 'signature reference',
  tradeId: 'trade',
  status: 'status',
  dateInitiated: 'date initiated',
  dateSubmitted: 'date submitted',
  anticipatedApproval: 'anticipated approval',
  priceFromLines: 'priced from lines',
  enteredOwnerAmount: 'entered owner amount',
  enteredCostAmount: 'entered cost amount',
  laborBurdenPct: 'labor burden',
  salesTaxPct: 'sales tax',
  smallToolsPct: 'small tools',
  contingencyPct: 'contingency',
  overheadPct: 'overhead',
  profitPct: 'profit',
  glInsurancePct: 'general liability insurance',
  bondPct: 'bond',
  exciseTaxPct: 'excise tax',
  roundToNearest: 'rounding',
  probabilityPct: 'probability',
  scheduleImpactDays: 'schedule impact',
  postsToBudget: 'posts to the budget',
  notes: 'notes',
}

function documentFields(row: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(DOCUMENT_LABELS).map((key) => [key, row[key]]))
}

export async function saveDocument(formData: FormData): Promise<{ error?: string; id?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = text(formData.get('id'))
  const projectId = String(formData.get('projectId'))
  const number = text(formData.get('number'))
  const description = text(formData.get('description'))
  const documentKind = String(formData.get('documentKind') ?? 'CHANGE_ORDER')
  const status = String(formData.get('status') ?? 'DRAFT')

  if (!number) return { error: 'Give the document a number.' }
  if (!description) return { error: 'Describe what is changing.' }
  if (!DOCUMENT_KINDS.has(documentKind)) return { error: 'Choose what kind of document this is.' }
  if (!DOCUMENT_STATUSES.has(status)) return { error: 'Choose a status.' }

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true, number: true },
  })
  if (!project) return { error: 'That project is not on this account.' }

  const clash = await prisma.changeOrder.findFirst({
    where: { projectId, number, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `${number} already exists on this project.` }

  const priceFromLines = String(formData.get('priceFromLines') ?? '') === 'on'

  const values = {
    number,
    documentKind: documentKind as DocumentKind,
    type: String(formData.get('type') ?? 'OWNER_REQUEST') as ChangeOrderType,
    description,
    origin: text(formData.get('origin')),
    counterparty: text(formData.get('counterparty')),
    reference: text(formData.get('reference')),
    tradeId: text(formData.get('tradeId')),
    status: status as DocumentStatus,
    dateInitiated: parseDate(formData.get('dateInitiated')),
    dateSubmitted: parseDate(formData.get('dateSubmitted')),
    anticipatedApproval: parseDate(formData.get('anticipatedApproval')),
    priceFromLines,
    enteredOwnerAmount: money(formData.get('enteredOwnerAmount')),
    enteredCostAmount: money(formData.get('enteredCostAmount')),
    laborBurdenPct: pct(formData.get('laborBurdenPct')),
    salesTaxPct: pct(formData.get('salesTaxPct')),
    smallToolsPct: pct(formData.get('smallToolsPct')),
    contingencyPct: pct(formData.get('contingencyPct')),
    overheadPct: pct(formData.get('overheadPct')),
    profitPct: pct(formData.get('profitPct')),
    glInsurancePct: pct(formData.get('glInsurancePct')),
    bondPct: pct(formData.get('bondPct')),
    exciseTaxPct: pct(formData.get('exciseTaxPct')),
    roundToNearest: money(formData.get('roundToNearest')),
    probabilityPct: pct(formData.get('probabilityPct')),
    scheduleImpactDays: Math.round(money(formData.get('scheduleImpactDays'))),
    postsToBudget: String(formData.get('postsToBudget') ?? 'on') === 'on',
    notes: text(formData.get('notes')),
  }

  if (id) {
    const existing = await ownedDocument(id, user.companyId)
    if (!existing) return { error: 'That document is not on this account.' }

    // An approved document's figures are already in the project. Everything
    // that could move them is refused; the rest is allowed through.
    if (existing.approvedAt !== null) {
      const financialKeys = [
        'priceFromLines',
        'enteredOwnerAmount',
        'enteredCostAmount',
        'laborBurdenPct',
        'salesTaxPct',
        'smallToolsPct',
        'contingencyPct',
        'overheadPct',
        'profitPct',
        'glInsurancePct',
        'bondPct',
        'exciseTaxPct',
        'roundToNearest',
        'postsToBudget',
      ] as const
      const moved = financialKeys.filter(
        (key) => (existing as Record<string, unknown>)[key] !== values[key],
      )
      if (moved.length > 0) {
        return {
          error: `${existing.number} is approved, so its pricing cannot be changed. Withdraw the approval first, which is recorded.`,
        }
      }
    }

    const updated = await prisma.changeOrder.update({ where: { id }, data: values })
    await recordFieldChanges({
      actor: user,
      entity: 'ChangeOrder',
      entityId: id,
      entityLabel: `${project.number} ${number}`,
      before: documentFields(existing as unknown as Record<string, unknown>),
      after: documentFields(updated as unknown as Record<string, unknown>),
      labels: DOCUMENT_LABELS,
    })
    await syncBudgetForDocument(id, user)
    refresh(projectId, id)
    return { id }
  }

  const created = await prisma.changeOrder.create({
    data: { ...values, projectId, dateInitiated: values.dateInitiated ?? new Date() },
  })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrder',
    entityId: created.id,
    entityLabel: `${project.number} ${number}`,
    action: 'CREATE',
    summary: `${number} raised, ${description}. Entered but not approved, so it changes no figures yet.`,
  })

  refresh(projectId, created.id)
  return { id: created.id }
}

/**
 * Rolls a time and materials ticket into the change order that bills it.
 *
 * The ticket stops counting on its own the moment it is rolled up, because the
 * change order carries the money. Without this the same signed hours would
 * reach the contract value twice.
 */
export async function rollUpDocument(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = String(formData.get('id'))
  const parentId = text(formData.get('rollsUpToId'))

  const document = await ownedDocument(id, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }

  // Changing where an approved ticket bills moves money, so it is refused the
  // same way every other pricing change is.
  const refusal = refuseIfApproved(document, 'what it is billed under')
  if (refusal) return refusal

  if (parentId) {
    if (parentId === id) return { error: 'A document cannot be billed under itself.' }
    const parent = await prisma.changeOrder.findFirst({
      where: { id: parentId, projectId: document.projectId },
      select: { id: true, number: true, documentKind: true, rollsUpToId: true },
    })
    if (!parent) return { error: 'That document is not on this project.' }
    if (parent.documentKind === 'TIME_AND_MATERIALS') {
      return { error: 'A ticket cannot be billed under another ticket. Roll it into a change order.' }
    }
    if (parent.rollsUpToId) {
      return { error: `${parent.number} is itself billed under something else, so nothing can roll into it.` }
    }
  }

  const previous = await prisma.changeOrder.findUnique({
    where: { id },
    select: { rollsUpTo: { select: { number: true } } },
  })

  await prisma.changeOrder.update({ where: { id }, data: { rollsUpToId: parentId } })

  const parentNumber = parentId
    ? (await prisma.changeOrder.findUniqueOrThrow({ where: { id: parentId }, select: { number: true } })).number
    : null

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrder',
    entityId: id,
    entityLabel: `${document.project.number} ${document.number}`,
    action: 'UPDATE',
    field: 'rollsUpToId',
    oldValue: previous?.rollsUpTo?.number ?? null,
    newValue: parentNumber,
    summary: parentNumber
      ? `${document.number} is now billed under ${parentNumber}, so it no longer counts on its own`
      : `${document.number} is no longer billed under another document, so it counts on its own again`,
  })

  refresh(document.projectId, id)
  return {}
}

export async function deleteDocument(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = String(formData.get('id'))
  const document = await ownedDocument(id, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }

  const refusal = refuseIfApproved(document, 'anything about it, or delete it')
  if (refusal) return refusal

  await prisma.changeOrder.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrder',
    entityId: id,
    entityLabel: `${document.project.number} ${document.number}`,
    action: 'DELETE',
    summary: `${document.number} deleted, ${document.description}`,
  })

  refresh(document.projectId)
  return {}
}

/** Moves a document along its journey, without touching any money. */
export async function setDocumentStatus(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = String(formData.get('id'))
  const status = String(formData.get('status') ?? '')
  if (!DOCUMENT_STATUSES.has(status)) return { error: 'Choose a status.' }

  const document = await ownedDocument(id, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }

  if (document.approvedAt !== null && status !== 'APPROVED') {
    return {
      error: `${document.number} is approved. Withdraw the approval before moving it back, so the reason is on the record.`,
    }
  }

  const now = new Date()
  const updated = await prisma.changeOrder.update({
    where: { id },
    data: {
      status: status as DocumentStatus,
      // Recorded the first time each milestone is reached, and left alone after.
      sentForSignatureAt:
        status === 'SENT_FOR_SIGNATURE' && !document.sentForSignatureAt ? now : document.sentForSignatureAt,
      fullySignedAt: status === 'FULLY_SIGNED' && !document.fullySignedAt ? now : document.fullySignedAt,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrder',
    entityId: id,
    entityLabel: `${document.project.number} ${document.number}`,
    action: 'UPDATE',
    field: 'status',
    oldValue: document.status,
    newValue: updated.status,
    summary: `${document.number} moved to ${status.toLowerCase().replace(/_/g, ' ')}. Its amount still does not count until it is approved.`,
  })

  refresh(document.projectId, id)
  return {}
}

// ── The approval, which is the whole point ────────────────────────────────

/**
 * Certifies that a document is signed and lets its amount into the project.
 *
 * Guarded four ways: the capability, the document's own state, the presence of
 * every signature it is waiting on, and the certification the approver has to
 * agree to in words. All four, the approver and the moment go onto the
 * permanent record, and the budget revisions post in the same action.
 */
export async function approveDocument(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'approve:contract_documents')

  const id = String(formData.get('id'))
  const certified = String(formData.get('certified') ?? '') === 'true'
  if (!certified) {
    return { error: 'The approval was not certified, so nothing was changed.' }
  }

  const priced = await getProjectDocument(id, user.companyId)
  if (!priced) return { error: 'That document is not on this account.' }

  if (priced.isOfficial) return { error: `${priced.number} is already approved.` }
  if (!priced.canApprove) return { error: priced.approvalBlockedReason ?? 'This document cannot be approved yet.' }

  const now = new Date()
  await prisma.changeOrder.update({
    where: { id },
    data: {
      approvedAt: now,
      approvedById: user.id,
      approvalCertification: APPROVAL_CERTIFICATION,
      unapprovedReason: null,
      status: 'APPROVED',
      dateApproved: priced.dateApproved ?? now,
      fullySignedAt: priced.fullySignedAt ?? now,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrder',
    entityId: id,
    entityLabel: `${priced.projectNumber} ${priced.number}`,
    action: 'APPROVE',
    field: 'approvedAt',
    oldValue: null,
    newValue: now,
    summary: `${priced.number} approved for ${priced.ownerAmount.toFixed(2)} and added to the contract value. Certified: ${APPROVAL_CERTIFICATION}`,
  })

  await syncBudgetForDocument(id, user)
  refresh(priced.projectId, id)
  return {}
}

/**
 * Withdraws an approval, taking the money back out of the project.
 *
 * A stronger capability than granting it, and a written reason, because this
 * moves a contract value downwards after somebody has relied on it.
 */
export async function unapproveDocument(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'unapprove:contract_documents')

  const id = String(formData.get('id'))
  const reason = text(formData.get('reason'))
  const confirmed = String(formData.get('confirmed') ?? '') === 'true'

  if (!confirmed) return { error: 'The withdrawal was not confirmed, so nothing was changed.' }
  if (!reason) return { error: 'Say why the approval is being withdrawn. It goes on the permanent record.' }

  const document = await ownedDocument(id, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }
  if (document.approvedAt === null) return { error: `${document.number} is not approved.` }

  await prisma.changeOrder.update({
    where: { id },
    data: {
      approvedAt: null,
      approvedById: null,
      approvalCertification: null,
      unapprovedReason: reason,
      status: 'FULLY_SIGNED',
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrder',
    entityId: id,
    entityLabel: `${document.project.number} ${document.number}`,
    action: 'UNLOCK',
    field: 'approvedAt',
    oldValue: document.approvedAt,
    newValue: null,
    summary: `Approval withdrawn from ${document.number} and its amount removed from the contract value and budget. Reason: ${reason}`,
  })

  await syncBudgetForDocument(id, user)
  refresh(document.projectId, id)
  return {}
}

// ── Priced lines ──────────────────────────────────────────────────────────

const LINE_LABELS: Record<string, string> = {
  costCodeId: 'cost code',
  category: 'cost type',
  description: 'description',
  scope: 'scope',
  divisionCode: 'division',
  measure: 'measure',
  count: 'count',
  length: 'length',
  width: 'width',
  depth: 'depth',
  netQtyOverride: 'quantity override',
  uom: 'unit',
  wastePct: 'waste',
  laborClass: 'labor class',
  laborHrsPerUnit: 'labor hours per unit',
  laborRateOverride: 'labor rate',
  equipmentClass: 'machine',
  equipmentHrsPerUnit: 'machine hours per unit',
  equipmentRateOverride: 'machine rate',
  materialUnitCost: 'material unit cost',
  equipmentUnitCost: 'equipment unit cost',
  subUnitCost: 'subcontract unit cost',
  otherUnitCost: 'other unit cost',
  notes: 'notes',
}

function lineFields(row: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(LINE_LABELS).map((key) => [key, row[key]]))
}

export async function saveDocumentLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = text(formData.get('id'))
  const documentId = String(formData.get('documentId'))
  const costCodeId = text(formData.get('costCodeId'))
  const category = String(formData.get('category') ?? 'OTHER')
  const measure = String(formData.get('measure') ?? 'LS')

  if (!costCodeId) return { error: 'Choose the cost code this line charges.' }
  if (!CATEGORIES.has(category)) return { error: 'Choose the cost type.' }
  if (!MEASURES.has(measure)) return { error: 'Choose how the quantity is measured.' }

  const document = await ownedDocument(documentId, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }

  const refusal = refuseIfApproved(document, 'its priced lines')
  if (refusal) return refusal

  const costCode = await prisma.costCode.findFirst({
    where: { id: costCodeId, companyId: user.companyId },
    select: { id: true, code: true, description: true },
  })
  if (!costCode) return { error: 'That cost code is not on this account.' }

  const values = {
    costCodeId,
    category: category as CostCategory,
    description: text(formData.get('description')) ?? costCode.description,
    scope: text(formData.get('scope')),
    divisionCode: text(formData.get('divisionCode')),
    measure: measure as MeasureType,
    count: money(formData.get('count')),
    length: money(formData.get('length')),
    width: money(formData.get('width')),
    depth: money(formData.get('depth')),
    netQtyOverride: optionalMoney(formData.get('netQtyOverride')),
    uom: text(formData.get('uom')),
    wastePct: pct(formData.get('wastePct')),
    laborClass: text(formData.get('laborClass')),
    laborHrsPerUnit: money(formData.get('laborHrsPerUnit')),
    laborRateOverride: optionalMoney(formData.get('laborRateOverride')),
    equipmentClass: text(formData.get('equipmentClass')),
    equipmentHrsPerUnit: money(formData.get('equipmentHrsPerUnit')),
    equipmentRateOverride: optionalMoney(formData.get('equipmentRateOverride')),
    materialUnitCost: money(formData.get('materialUnitCost')),
    equipmentUnitCost: money(formData.get('equipmentUnitCost')),
    subUnitCost: money(formData.get('subUnitCost')),
    otherUnitCost: money(formData.get('otherUnitCost')),
    notes: text(formData.get('notes')),
  }

  if (id) {
    const existing = await prisma.changeOrderLine.findFirst({ where: { id, changeOrderId: documentId } })
    if (!existing) return { error: 'That line is not on this document.' }

    const updated = await prisma.changeOrderLine.update({ where: { id }, data: values })
    await recordFieldChanges({
      actor: user,
      entity: 'ChangeOrderLine',
      entityId: id,
      entityLabel: `${document.number} ${values.description}`,
      before: lineFields(existing as unknown as Record<string, unknown>),
      after: lineFields(updated as unknown as Record<string, unknown>),
      labels: LINE_LABELS,
    })
  } else {
    const last = await prisma.changeOrderLine.findFirst({
      where: { changeOrderId: documentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.changeOrderLine.create({
      data: { ...values, changeOrderId: documentId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'ChangeOrderLine',
      entityId: created.id,
      entityLabel: `${document.number} ${values.description}`,
      action: 'CREATE',
      summary: `Line added to ${document.number} against ${costCode.code}`,
    })
  }

  refresh(document.projectId, documentId)
  return {}
}

export async function deleteDocumentLine(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = String(formData.get('id'))
  const line = await prisma.changeOrderLine.findFirst({
    where: { id, changeOrder: { project: { companyId: user.companyId } } },
    include: { changeOrder: { select: { id: true, number: true, projectId: true, approvedAt: true } } },
  })
  if (!line) return { error: 'That line is not on this account.' }

  const refusal = refuseIfApproved(line.changeOrder, 'its priced lines')
  if (refusal) return refusal

  await prisma.changeOrderLine.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'ChangeOrderLine',
    entityId: id,
    entityLabel: `${line.changeOrder.number} ${line.description ?? ''}`.trim(),
    action: 'DELETE',
    summary: `Line removed from ${line.changeOrder.number}`,
  })

  refresh(line.changeOrder.projectId, line.changeOrder.id)
  return {}
}

// ── Signatures ────────────────────────────────────────────────────────────

export async function saveSignature(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = text(formData.get('id'))
  const documentId = String(formData.get('documentId'))
  const party = text(formData.get('party'))
  const status = String(formData.get('status') ?? 'AWAITING')
  if (!party) return { error: 'Name the party who has to sign.' }
  if (!['AWAITING', 'SIGNED', 'DECLINED'].includes(status)) return { error: 'Choose where this party stands.' }

  const document = await ownedDocument(documentId, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }

  // A signature on an approved document would change what was certified.
  const refusal = refuseIfApproved(document, 'who signed it')
  if (refusal) return refusal

  const signedAt = status === 'SIGNED' ? (parseDate(formData.get('signedAt')) ?? new Date()) : null

  const clash = await prisma.documentSignature.findFirst({
    where: { changeOrderId: documentId, party, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  })
  if (clash) return { error: `${party} is already on this document.` }

  const values = {
    party,
    role: text(formData.get('role')),
    email: text(formData.get('email')),
    status: status as SignatureStatus,
    signedAt,
    note: text(formData.get('note')),
  }

  if (id) {
    const existing = await prisma.documentSignature.findFirst({ where: { id, changeOrderId: documentId } })
    if (!existing) return { error: 'That party is not on this document.' }
    await prisma.documentSignature.update({ where: { id }, data: values })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'DocumentSignature',
      entityId: id,
      entityLabel: `${document.number} ${party}`,
      action: status === 'SIGNED' ? 'APPROVE' : 'UPDATE',
      oldValue: existing.status,
      newValue: status,
      summary:
        status === 'SIGNED'
          ? `${party} signed ${document.number} on ${signedAt!.toISOString().slice(0, 10)}`
          : `${party} on ${document.number} is now ${status.toLowerCase()}`,
    })
  } else {
    const last = await prisma.documentSignature.findFirst({
      where: { changeOrderId: documentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const created = await prisma.documentSignature.create({
      data: { ...values, changeOrderId: documentId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      actor: user,
      entity: 'DocumentSignature',
      entityId: created.id,
      entityLabel: `${document.number} ${party}`,
      action: 'CREATE',
      summary: `${party} added as a required signer on ${document.number}`,
    })
  }

  // The status follows the signatures rather than being kept in step by hand.
  await syncSignatureStatus(documentId)
  refresh(document.projectId, documentId)
  return {}
}

export async function deleteSignature(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = String(formData.get('id'))
  const signature = await prisma.documentSignature.findFirst({
    where: { id, changeOrder: { project: { companyId: user.companyId } } },
    include: { changeOrder: { select: { id: true, number: true, projectId: true, approvedAt: true } } },
  })
  if (!signature) return { error: 'That party is not on this account.' }

  const refusal = refuseIfApproved(signature.changeOrder, 'who signed it')
  if (refusal) return refusal

  await prisma.documentSignature.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'DocumentSignature',
    entityId: id,
    entityLabel: `${signature.changeOrder.number} ${signature.party}`,
    action: 'DELETE',
    summary: `${signature.party} removed as a required signer on ${signature.changeOrder.number}`,
  })

  await syncSignatureStatus(signature.changeOrder.id)
  refresh(signature.changeOrder.projectId, signature.changeOrder.id)
  return {}
}

/**
 * Keeps the document's status in step with its signatures.
 *
 * Only ever moves it between the three signature states. It never approves
 * anything, and it never touches a document that has already been through
 * approval, rejection or cancellation.
 */
async function syncSignatureStatus(documentId: string) {
  const document = await prisma.changeOrder.findUniqueOrThrow({
    where: { id: documentId },
    include: { signatures: true },
  })
  if (document.approvedAt !== null) return
  if (!['SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'FULLY_SIGNED'].includes(document.status)) return

  const total = document.signatures.length
  const signed = document.signatures.filter((signature) => signature.status === 'SIGNED').length

  const next =
    total > 0 && signed === total ? 'FULLY_SIGNED' : signed > 0 ? 'PARTIALLY_SIGNED' : 'SENT_FOR_SIGNATURE'

  if (next === document.status) return
  await prisma.changeOrder.update({
    where: { id: documentId },
    data: {
      status: next as DocumentStatus,
      fullySignedAt: next === 'FULLY_SIGNED' ? (document.fullySignedAt ?? new Date()) : document.fullySignedAt,
    },
  })
}

// ── Attachments ───────────────────────────────────────────────────────────

const ATTACHMENT_KINDS = new Set<string>([
  'SIGNED_DOCUMENT',
  'UNSIGNED_DOCUMENT',
  'PRICING_BACKUP',
  'SUBCONTRACTOR_QUOTE',
  'CORRESPONDENCE',
  'OTHER',
] satisfies DocumentAttachmentKind[])

export async function saveAttachment(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const documentId = String(formData.get('documentId'))
  const fileName = text(formData.get('fileName'))
  const kind = String(formData.get('kind') ?? 'SIGNED_DOCUMENT')
  if (!fileName) return { error: 'Name the file.' }
  if (!ATTACHMENT_KINDS.has(kind)) return { error: 'Say what kind of record this is.' }

  const document = await ownedDocument(documentId, user.companyId)
  if (!document) return { error: 'That document is not on this account.' }

  // Attaching the signed copy to an approved document is allowed and wanted:
  // it is the evidence behind the approval, not a change to its money.
  const created = await prisma.documentAttachment.create({
    data: {
      changeOrderId: documentId,
      kind: kind as DocumentAttachmentKind,
      fileName,
      location: text(formData.get('location')),
      note: text(formData.get('note')),
      uploadedById: user.id,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'DocumentAttachment',
    entityId: created.id,
    entityLabel: `${document.number} ${fileName}`,
    action: 'CREATE',
    summary: `${fileName} attached to ${document.number} as ${kind.toLowerCase().replace(/_/g, ' ')}`,
  })

  refresh(document.projectId, documentId)
  return {}
}

export async function deleteAttachment(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:change_orders')

  const id = String(formData.get('id'))
  const attachment = await prisma.documentAttachment.findFirst({
    where: { id, changeOrder: { project: { companyId: user.companyId } } },
    include: { changeOrder: { select: { id: true, number: true, projectId: true, approvedAt: true } } },
  })
  if (!attachment) return { error: 'That attachment is not on this account.' }

  // Removing the signed copy from an approved document takes away the evidence
  // the approval rests on, so it needs the same authority as withdrawing one.
  if (attachment.changeOrder.approvedAt !== null && attachment.kind === 'SIGNED_DOCUMENT') {
    if (!can(user.role, 'unapprove:contract_documents')) {
      return {
        error: `${attachment.fileName} is the signed copy behind an approved document. Only somebody who could withdraw the approval can remove it.`,
      }
    }
  }

  await prisma.documentAttachment.delete({ where: { id } })
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'DocumentAttachment',
    entityId: id,
    entityLabel: `${attachment.changeOrder.number} ${attachment.fileName}`,
    action: 'DELETE',
    summary: `${attachment.fileName} removed from ${attachment.changeOrder.number}`,
  })

  refresh(attachment.changeOrder.projectId, attachment.changeOrder.id)
  return {}
}
