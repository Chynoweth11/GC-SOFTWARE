import { num, safeDiv, sumBy } from './core'
import { daysBetween } from './dates'
import {
  buildBidBuildUp,
  deriveEstimateItem,
  type BidBuildUp,
  type EstimateItemDerived,
  type EstimateItemInput,
  type LaborRateEntry,
} from './estimate'
import type { CostCategory } from './types'

/**
 * Change orders, contracts, amendments and addendums, and the one rule that
 * decides whether any of them is allowed to move the project's money.
 *
 * The rule is this: **a document counts in the project's official figures if
 * and only if it carries an approval.** Not because its status says approved,
 * not because every party has signed, not because somebody typed an amount in.
 * Approval is a separate, deliberate, attributed act, and `isOfficial()` below
 * is the single place that question is answered. Every contract value, budget
 * revision, forecast, dashboard tile and report reads through it.
 *
 * Signing and approving are kept apart on purpose. A document can sit fully
 * signed for a week while somebody checks that it really is the signed copy.
 * Conflating the two is how unsigned money ends up in a contract value.
 *
 * Pricing reuses the takeoff engine rather than restating it. A change order is
 * a small estimate: quantities from measures and dimensions, labor at hours
 * times a rate, material taxed, then the same markup chain in the same order.
 * Two pricing engines would have disagreed by the end of the first job.
 */

export type DocumentKind =
  | 'CHANGE_ORDER'
  | 'CONTRACT'
  | 'CONTRACT_AMENDMENT'
  | 'ADDENDUM'
  | 'OWNER_CHANGE'
  | 'SUBCONTRACT_CHANGE'
  | 'OTHER'

export type DocumentStatus =
  | 'DRAFT'
  | 'INTERNAL_REVIEW'
  | 'READY_TO_SEND'
  | 'SENT_FOR_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'FULLY_SIGNED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'VOIDED'
  | 'SUPERSEDED'

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  CHANGE_ORDER: 'Change order',
  CONTRACT: 'Contract',
  CONTRACT_AMENDMENT: 'Contract amendment',
  ADDENDUM: 'Addendum',
  OWNER_CHANGE: 'Owner change',
  SUBCONTRACT_CHANGE: 'Subcontract change',
  OTHER: 'Other document',
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal review',
  READY_TO_SEND: 'Ready to send',
  SENT_FOR_SIGNATURE: 'Sent for signature',
  PARTIALLY_SIGNED: 'Partially signed',
  FULLY_SIGNED: 'Fully signed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  VOIDED: 'Voided',
  SUPERSEDED: 'Superseded',
}

/**
 * Statuses from which an approval may be certified.
 *
 * Everything here means every party has signed. A document still in review or
 * still out for signature has nothing to certify, and one that was rejected,
 * cancelled, voided or superseded has nothing left to approve.
 */
export const SIGNABLE_FOR_APPROVAL = new Set<DocumentStatus>(['FULLY_SIGNED', 'APPROVED'])

/** Statuses that will never become money, so they are excluded from exposure. */
export const DEAD_STATUSES = new Set<DocumentStatus>(['REJECTED', 'CANCELLED', 'VOIDED', 'SUPERSEDED'])

/** A document kind that moves the owner contract rather than only cost. */
export const REVENUE_KINDS = new Set<DocumentKind>([
  'CHANGE_ORDER',
  'CONTRACT',
  'CONTRACT_AMENDMENT',
  'ADDENDUM',
  'OWNER_CHANGE',
])

export interface DocumentLineInput extends Omit<EstimateItemInput, 'sectionId' | 'divisionCode'> {
  costCodeId: string
  costCodeLabel?: string | null
  category: CostCategory
  divisionCode: string | null
}

export interface DocumentMarkups {
  laborBurdenPct: number
  salesTaxPct: number
  smallToolsPct: number
  contingencyPct: number
  overheadPct: number
  profitPct: number
  glInsurancePct: number
  bondPct: number
  exciseTaxPct: number
  roundToNearest: number
}

export interface DocumentInput {
  id: string
  number: string
  documentKind: DocumentKind
  /// Why the change arose: an owner request, a field condition, a backcharge.
  type: string
  status: DocumentStatus
  description: string
  /** Priced from its lines, or a lump sum taken off paper. */
  priceFromLines: boolean
  enteredOwnerAmount: number
  enteredCostAmount: number
  markups: DocumentMarkups
  probabilityPct: number
  scheduleImpactDays: number
  dateInitiated: Date | null
  dateApproved: Date | null
  sentForSignatureAt: Date | null
  fullySignedAt: Date | null
  /** The single gate. Null means this document moves no money at all. */
  approvedAt: Date | null
  approvedByName: string | null
  approvalCertification: string | null
  postsToBudget: boolean
  signatures: { party: string; status: string; signedAt: Date | null }[]
  attachmentCount: number
  signedDocumentCount: number
}

export interface DocumentLineDerived extends EstimateItemDerived {
  costCodeId: string
  costCodeLabel: string | null
  category: CostCategory
}

export interface DocumentDerived extends DocumentInput {
  lines: DocumentLineDerived[]
  /** The build-up, present only when the document is priced from its lines. */
  buildUp: BidBuildUp | null
  /** Cost impact. Derived from the lines, or the entered figure. */
  costAmount: number
  /** Revenue impact presented to the counterparty. */
  ownerAmount: number
  /** Where each of the two came from, for the page to say plainly. */
  amountBasis: 'lines' | 'entered'
  margin: number
  marginPct: number
  daysPending: number
  /** The single question everything downstream asks. */
  isOfficial: boolean
  /** Entered, signed, but not yet certified: real exposure, not yet money. */
  isPending: boolean
  isDead: boolean
  /** True when this document may be certified now. */
  canApprove: boolean
  /** Why not, when it cannot. */
  approvalBlockedReason: string | null
  signedCount: number
  signatureCount: number
  weightedOwnerAmount: number
  weightedCostAmount: number
  costByCategory: { category: CostCategory; amount: number }[]
  issues: string[]
}

/**
 * The one question every downstream figure asks about a document.
 *
 * Deliberately not "is the status approved". A status is a label somebody
 * chose from a list; `approvedAt` is set by one action, guarded, certified and
 * written to the permanent history in the same breath.
 */
export function isOfficial(document: { approvedAt: Date | null }): boolean {
  return document.approvedAt !== null
}

/**
 * Prices one document and works out where it stands.
 *
 * `laborRates` is the same map the estimate uses, so a change order priced
 * against the company classification library gets the loaded rate and does not
 * take the flat burden on top of it.
 */
export function deriveDocument(
  document: DocumentInput,
  lines: readonly DocumentLineInput[],
  laborRates: ReadonlyMap<string, LaborRateEntry>,
  dataDate: Date,
): DocumentDerived {
  const derivedLines: DocumentLineDerived[] = lines.map((line) => ({
    ...deriveEstimateItem(
      { ...line, sectionId: null },
      {
        laborBurdenPct: document.markups.laborBurdenPct,
        salesTaxPct: document.markups.salesTaxPct,
        smallToolsPct: document.markups.smallToolsPct,
        laborRates,
      },
    ),
    costCodeId: line.costCodeId,
    costCodeLabel: line.costCodeLabel ?? null,
    category: line.category,
  }))

  const directCost = sumBy(derivedLines, (line) => line.totalCost)
  const laborCost = sumBy(derivedLines, (line) => line.laborCost)

  const buildUp = document.priceFromLines
    ? buildBidBuildUp({
        ...document.markups,
        directCost,
        laborCost,
        smallToolsPct: document.markups.smallToolsPct,
      })
    : null

  // Cost is what the work costs; the owner amount is what it is sold for. When
  // the document is priced from its lines the second is the first plus the
  // markup chain, so the margin cannot be typed in inconsistently.
  const costAmount = document.priceFromLines ? buildUp!.costSubtotal : num(document.enteredCostAmount)
  const ownerAmount = document.priceFromLines ? buildUp!.roundedBid : num(document.enteredOwnerAmount)

  const official = isOfficial(document)
  const isDead = DEAD_STATUSES.has(document.status)
  const isPending = !official && !isDead

  let daysPending = 0
  if (document.dateInitiated) {
    const end = official ? document.approvedAt : dataDate
    if (end) daysPending = daysBetween(document.dateInitiated, end)
  }

  const signatureCount = document.signatures.length
  const signedCount = document.signatures.filter((signature) => signature.status === 'SIGNED').length

  const approvalBlockedReason = blockedReason(document, signatureCount, signedCount)

  const categories = [...new Set(derivedLines.map((line) => line.category))]
  const costByCategory = categories.map((category) => ({
    category,
    amount: sumBy(
      derivedLines.filter((line) => line.category === category),
      (line) => line.totalCost,
    ),
  }))

  const issues: string[] = []
  if (document.priceFromLines && derivedLines.length === 0) {
    issues.push('Priced from lines, but there are none, so this document is worth nothing yet.')
  }
  if (!document.priceFromLines) {
    issues.push('Recorded as a lump sum rather than priced from lines. The breakdown below is for allocation only.')
  }
  const flagged = derivedLines.filter((line) => line.qaFlags.length > 0)
  if (flagged.length > 0) {
    issues.push(`${flagged.length} ${flagged.length === 1 ? 'line is' : 'lines are'} flagged by the pricing checks.`)
  }
  if (official && document.signedDocumentCount === 0) {
    issues.push('Approved, but no signed copy is attached. Attach it so the approval can be produced later.')
  }
  if (ownerAmount < 0 && REVENUE_KINDS.has(document.documentKind)) {
    issues.push('A credit to the owner. Check the sign before this is approved.')
  }
  if (document.priceFromLines && ownerAmount > 0 && costAmount > ownerAmount) {
    issues.push('The cost is above the amount presented, so this document loses money as priced.')
  }

  return {
    ...document,
    lines: derivedLines,
    buildUp,
    costAmount,
    ownerAmount,
    amountBasis: document.priceFromLines ? 'lines' : 'entered',
    margin: ownerAmount - costAmount,
    marginPct: safeDiv(ownerAmount - costAmount, ownerAmount),
    daysPending,
    isOfficial: official,
    isPending,
    isDead,
    canApprove: approvalBlockedReason === null,
    approvalBlockedReason,
    signedCount,
    signatureCount,
    weightedOwnerAmount: ownerAmount * num(document.probabilityPct),
    weightedCostAmount: costAmount * num(document.probabilityPct),
    costByCategory,
    issues,
  }
}

/** Why a document cannot be certified yet, in the words the page will use. */
function blockedReason(
  document: DocumentInput,
  signatureCount: number,
  signedCount: number,
): string | null {
  if (isOfficial(document)) return 'This document is already approved.'
  if (DEAD_STATUSES.has(document.status)) {
    return `A ${DOCUMENT_STATUS_LABELS[document.status].toLowerCase()} document has nothing left to approve.`
  }
  if (!SIGNABLE_FOR_APPROVAL.has(document.status)) {
    return `Every party has to sign before this can be approved. It is ${DOCUMENT_STATUS_LABELS[document.status].toLowerCase()}.`
  }
  if (signatureCount > 0 && signedCount < signatureCount) {
    return `${signatureCount - signedCount} of ${signatureCount} parties have not signed yet.`
  }
  return null
}

export interface DocumentTotals {
  /** Everything on the job, whatever its state. */
  entered: number
  enteredCount: number
  /** Approved and certified. The only figure that reaches the project. */
  approved: number
  approvedCount: number
  /** Entered, alive, not yet certified. Exposure, not money. */
  pending: number
  pendingCount: number
  /** Rejected, cancelled, voided or superseded. */
  rejected: number
  rejectedCount: number
  /** Cost side of the same four. */
  approvedCost: number
  pendingCost: number
  approvedMargin: number
  approvedMarginPct: number
  weightedPending: number
  avgDaysPending: number
  /** Approved schedule impact, which is the only kind that is real. */
  scheduleImpactDays: number
}

/**
 * The four totals a change order tab has to show.
 *
 * They are shown together because each answers a different question and only
 * one of them is money. Entered says how much has been raised, approved says
 * what the contract is worth, pending says what is at stake, and rejected says
 * what was asked for and refused. A tab that showed only one of them would
 * invite somebody to read it as the wrong one.
 */
export function documentTotals(documents: readonly DocumentDerived[]): DocumentTotals {
  const approved = documents.filter((document) => document.isOfficial)
  const pending = documents.filter((document) => document.isPending)
  const rejected = documents.filter((document) => document.isDead)

  const approvedRevenue = sumBy(approved, (document) => document.ownerAmount)
  const approvedCost = sumBy(approved, (document) => document.costAmount)

  return {
    entered: sumBy(documents, (document) => document.ownerAmount),
    enteredCount: documents.length,
    approved: approvedRevenue,
    approvedCount: approved.length,
    pending: sumBy(pending, (document) => document.ownerAmount),
    pendingCount: pending.length,
    rejected: sumBy(rejected, (document) => document.ownerAmount),
    rejectedCount: rejected.length,
    approvedCost,
    pendingCost: sumBy(pending, (document) => document.costAmount),
    approvedMargin: approvedRevenue - approvedCost,
    approvedMarginPct: safeDiv(approvedRevenue - approvedCost, approvedRevenue),
    weightedPending: sumBy(pending, (document) => document.weightedOwnerAmount),
    avgDaysPending: pending.length ? sumBy(pending, (document) => document.daysPending) / pending.length : 0,
    scheduleImpactDays: sumBy(approved, (document) => document.scheduleImpactDays),
  }
}

/**
 * The original contract value, and where it came from.
 *
 * A project set up by hand carries the figure typed onto it. A project whose
 * prime contract has been recorded and approved as a document carries the sum
 * of those documents instead, because that is the one with signatures behind
 * it. The page says which it is reading rather than leaving it to be guessed.
 */
export function originalContractValue(
  documents: readonly DocumentDerived[],
  enteredOriginal: number,
): { amount: number; basis: 'contract documents' | 'project setup'; documentCount: number } {
  const contracts = documents.filter(
    (document) => document.documentKind === 'CONTRACT' && document.isOfficial,
  )
  if (contracts.length === 0) {
    return { amount: num(enteredOriginal), basis: 'project setup', documentCount: 0 }
  }
  return {
    amount: sumBy(contracts, (document) => document.ownerAmount),
    basis: 'contract documents',
    documentCount: contracts.length,
  }
}

/**
 * Documents that change the owner contract, which is not all of them.
 *
 * A subcontract change moves cost and nothing else; putting it into the
 * contract value would invent revenue. The prime contract is excluded too,
 * because it is the original value rather than a change to it.
 */
export function contractChangeDocuments(documents: readonly DocumentDerived[]): DocumentDerived[] {
  return documents.filter(
    (document) => REVENUE_KINDS.has(document.documentKind) && document.documentKind !== 'CONTRACT',
  )
}
