import { describe, expect, it } from 'vitest'
import {
  deriveDocument,
  documentTotals,
  isOfficial,
  originalContractValue,
  type DocumentInput,
  type DocumentLineInput,
  type DocumentMarkups,
} from './documents'
import type { LaborRateEntry } from './estimate'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DATA_DATE = D('2026-03-31')

const NO_MARKUP: DocumentMarkups = {
  laborBurdenPct: 0,
  salesTaxPct: 0,
  smallToolsPct: 0,
  contingencyPct: 0,
  overheadPct: 0,
  profitPct: 0,
  glInsurancePct: 0,
  bondPct: 0,
  exciseTaxPct: 0,
  roundToNearest: 0,
}

const doc = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  id: 'd1',
  number: 'CO-001',
  documentKind: 'CHANGE_ORDER',
  type: 'OWNER_REQUEST',
  status: 'DRAFT',
  description: 'Added canopy',
  priceFromLines: true,
  enteredOwnerAmount: 0,
  enteredCostAmount: 0,
  markups: NO_MARKUP,
  probabilityPct: 0,
  scheduleImpactDays: 0,
  dateInitiated: D('2026-02-01'),
  dateApproved: null,
  sentForSignatureAt: null,
  fullySignedAt: null,
  approvedAt: null,
  approvedByName: null,
  approvalCertification: null,
  postsToBudget: true,
  signatures: [],
  attachmentCount: 0,
  signedDocumentCount: 0,
  ...over,
})

const line = (over: Partial<DocumentLineInput> = {}): DocumentLineInput => ({
  id: 'l1',
  costCodeId: 'cc1',
  costCodeLabel: '06-100 Rough carpentry',
  category: 'LABOR',
  divisionCode: '06',
  description: 'Framing the canopy',
  measure: 'SF',
  count: 1,
  length: 40,
  width: 10,
  depth: 0,
  netQtyOverride: null,
  uom: 'SF',
  wastePct: 0,
  laborClass: null,
  laborHrsPerUnit: 0,
  laborRateOverride: null,
  materialUnitCost: 0,
  equipmentUnitCost: 0,
  subUnitCost: 0,
  otherUnitCost: 0,
  ...over,
})

const derive = (
  over: Partial<DocumentInput> = {},
  lines: DocumentLineInput[] = [],
  rates: ReadonlyMap<string, LaborRateEntry> = new Map(),
) => deriveDocument(doc(over), lines, rates, DATA_DATE)

describe('isOfficial: the single gate', () => {
  it('is the approval and nothing else', () => {
    expect(isOfficial({ approvedAt: null })).toBe(false)
    expect(isOfficial({ approvedAt: D('2026-03-02') })).toBe(true)
  })
})

describe('pricing a document from its lines', () => {
  it('prices a takeoff line exactly as the estimate would', () => {
    const document = derive({}, [
      // 40 x 10 = 400 SF, 0.05 hours a foot at 60 an hour, 12 a foot of material
      line({ laborHrsPerUnit: 0.05, laborRateOverride: 60, materialUnitCost: 12 }),
    ])

    const priced = document.lines[0]
    expect(priced.netQty).toBe(400)
    expect(priced.laborHours).toBe(20)
    expect(priced.laborCost).toBe(1_200)
    expect(priced.materialCost).toBe(4_800)
    expect(priced.totalCost).toBe(6_000)
    expect(document.costAmount).toBe(6_000)
  })

  it('carries waste into the quantity, and tax into the material', () => {
    const document = derive({ markups: { ...NO_MARKUP, salesTaxPct: 0.089 } }, [
      line({ wastePct: 0.1, materialUnitCost: 10 }),
    ])
    // 400 x 1.1 = 440 SF at 10, taxed at 8.9 percent
    expect(document.lines[0].grossQty).toBeCloseTo(440, 10)
    expect(document.lines[0].materialCost).toBeCloseTo(440 * 10 * 1.089, 8)
  })

  it('prices the fifth bucket, which a takeoff sends to its general conditions sheet', () => {
    const document = derive({}, [
      line({ category: 'GENERAL_CONDITIONS', measure: 'LS', count: 1, otherUnitCost: 8_200 }),
    ])
    expect(document.lines[0].otherCost).toBe(8_200)
    expect(document.costAmount).toBe(8_200)
  })

  it('runs the markup chain in the same order as the bid summary', () => {
    const document = derive(
      {
        markups: {
          ...NO_MARKUP,
          contingencyPct: 0.05,
          overheadPct: 0.06,
          profitPct: 0.1,
          glInsurancePct: 0.012,
          bondPct: 0.01,
        },
      },
      [line({ measure: 'LS', count: 1, otherUnitCost: 100_000 })],
    )

    const build = document.buildUp!
    expect(build.directCost).toBe(100_000)
    expect(build.contingency).toBeCloseTo(5_000, 8)
    expect(build.costSubtotal).toBeCloseTo(105_000, 8)
    expect(build.overhead).toBeCloseTo(6_300, 8)
    expect(build.profit).toBeCloseTo(11_130, 8) // (105,000 + 6,300) x 10 percent
    expect(build.subtotal).toBeCloseTo(122_430, 8)
    expect(build.glInsurance).toBeCloseTo(1_469.16, 6)
    expect(build.bond).toBeCloseTo(1_224.3, 6)
    expect(build.totalBid).toBeCloseTo(125_123.46, 6)

    // The cost the budget carries is the cost subtotal, not the sold amount.
    expect(document.costAmount).toBeCloseTo(105_000, 8)
    expect(document.ownerAmount).toBeCloseTo(125_123.46, 6)
    expect(document.margin).toBeCloseTo(20_123.46, 6)
  })

  it('takes a library rate without adding the flat burden a second time', () => {
    const rates = new Map<string, LaborRateEntry>([
      ['Carpenter', { rate: 65.9, burdened: true, source: 'Classification library' }],
    ])
    const document = derive(
      { markups: { ...NO_MARKUP, laborBurdenPct: 0.34 } },
      [line({ measure: 'EA', count: 100, laborClass: 'Carpenter', laborHrsPerUnit: 1 })],
      rates,
    )
    expect(document.lines[0].laborCost).toBeCloseTo(100 * 65.9, 8)
    expect(document.lines[0].laborRateBurdened).toBe(true)
  })

  it('reads the entered figures instead when the document is a lump sum', () => {
    const document = derive({
      priceFromLines: false,
      enteredOwnerAmount: 1_000_000,
      enteredCostAmount: 820_000,
    })
    expect(document.ownerAmount).toBe(1_000_000)
    expect(document.costAmount).toBe(820_000)
    expect(document.amountBasis).toBe('entered')
    expect(document.buildUp).toBeNull()
    expect(document.issues.some((issue) => issue.includes('lump sum'))).toBe(true)
  })

  it('groups the cost by the type each line charges, which is what the budget needs', () => {
    const document = derive({}, [
      line({ id: 'a', category: 'LABOR', measure: 'LS', count: 1, laborHrsPerUnit: 1, laborRateOverride: 5_000 }),
      line({ id: 'b', category: 'MATERIAL', measure: 'LS', count: 1, materialUnitCost: 12_000 }),
      line({ id: 'c', category: 'SUBCONTRACT', measure: 'LS', count: 1, subUnitCost: 40_000 }),
    ])
    expect(document.costByCategory).toEqual([
      { category: 'LABOR', amount: 5_000 },
      { category: 'MATERIAL', amount: 12_000 },
      { category: 'SUBCONTRACT', amount: 40_000 },
    ])
  })
})

describe('when a document may be approved', () => {
  const signature = (party: string, status: string) => ({ party, status, signedAt: null })

  it('refuses a draft', () => {
    const document = derive({ status: 'DRAFT' })
    expect(document.canApprove).toBe(false)
    expect(document.approvalBlockedReason).toContain('has to sign')
  })

  it('refuses one still out for signature', () => {
    const document = derive({ status: 'SENT_FOR_SIGNATURE' })
    expect(document.canApprove).toBe(false)
    expect(document.approvalBlockedReason).toContain('sent for signature')
  })

  it('refuses one where a party has not signed, even at fully signed', () => {
    const document = derive({
      status: 'FULLY_SIGNED',
      signatures: [signature('Owner', 'SIGNED'), signature('Architect', 'AWAITING')],
    })
    expect(document.canApprove).toBe(false)
    expect(document.approvalBlockedReason).toContain('1 of 2 parties have not signed')
  })

  it('allows one every party has signed', () => {
    const document = derive({
      status: 'FULLY_SIGNED',
      signatures: [signature('Owner', 'SIGNED'), signature('Contractor', 'SIGNED')],
    })
    expect(document.canApprove).toBe(true)
    expect(document.approvalBlockedReason).toBeNull()
    expect(document.signedCount).toBe(2)
  })

  it('refuses a rejected or cancelled document outright', () => {
    for (const status of ['REJECTED', 'CANCELLED', 'VOIDED', 'SUPERSEDED'] as const) {
      const document = derive({ status })
      expect(document.canApprove).toBe(false)
      expect(document.approvalBlockedReason).toContain('nothing left to approve')
    }
  })

  it('refuses one that is already approved', () => {
    const document = derive({ status: 'APPROVED', approvedAt: D('2026-03-02') })
    expect(document.canApprove).toBe(false)
    expect(document.approvalBlockedReason).toContain('already approved')
  })
})

describe('what a document warns about', () => {
  it('says an approved document has no signed copy attached', () => {
    const document = derive({ status: 'APPROVED', approvedAt: D('2026-03-02'), signedDocumentCount: 0 })
    expect(document.issues.some((issue) => issue.includes('no signed copy'))).toBe(true)
  })

  it('stays quiet when the signed copy is there', () => {
    const document = derive({
      status: 'APPROVED',
      approvedAt: D('2026-03-02'),
      attachmentCount: 1,
      signedDocumentCount: 1,
    })
    expect(document.issues.some((issue) => issue.includes('no signed copy'))).toBe(false)
  })

  it('says a document priced from lines has none', () => {
    expect(derive().issues.some((issue) => issue.includes('there are none'))).toBe(true)
  })

  it('says when the cost is above the amount presented', () => {
    const document = derive(
      { priceFromLines: false, enteredOwnerAmount: 10_000, enteredCostAmount: 12_000 },
      [],
    )
    expect(document.margin).toBe(-2_000)
  })
})

describe('documentTotals', () => {
  const built = [
    derive({ id: 'a', priceFromLines: false, enteredOwnerAmount: 1_000_000, approvedAt: D('2026-03-01') }),
    derive({ id: 'b', priceFromLines: false, enteredOwnerAmount: 800_000, status: 'FULLY_SIGNED' }),
    derive({ id: 'c', priceFromLines: false, enteredOwnerAmount: 500_000, status: 'SENT_FOR_SIGNATURE' }),
    derive({ id: 'd', priceFromLines: false, enteredOwnerAmount: 200_000, status: 'REJECTED' }),
  ]

  it('reports the example from the brief', () => {
    const totals = documentTotals(built)
    expect(totals.entered).toBe(2_500_000)
    expect(totals.approved).toBe(1_000_000)
    expect(totals.pending).toBe(1_300_000)
    expect(totals.rejected).toBe(200_000)
  })

  it('counts each document in exactly one of the three, and all of them in entered', () => {
    const totals = documentTotals(built)
    expect(totals.approvedCount + totals.pendingCount + totals.rejectedCount).toBe(totals.enteredCount)
    expect(totals.approved + totals.pending + totals.rejected).toBe(totals.entered)
  })

  it('averages days pending over the pending ones only', () => {
    const totals = documentTotals(built)
    // Both pending documents were initiated on 1 February, 58 days before the data date.
    expect(totals.avgDaysPending).toBe(58)
  })

  it('reports nothing rather than dividing by zero on an empty list', () => {
    const totals = documentTotals([])
    expect(totals.entered).toBe(0)
    expect(totals.approvedMarginPct).toBe(0)
    expect(totals.avgDaysPending).toBe(0)
  })
})

describe('originalContractValue', () => {
  it('prefers approved contract documents over the figure typed at setup', () => {
    const contract = derive({
      documentKind: 'CONTRACT',
      priceFromLines: false,
      enteredOwnerAmount: 10_000_000,
      approvedAt: D('2026-01-05'),
    })
    const result = originalContractValue([contract], 9_000_000)
    expect(result.amount).toBe(10_000_000)
    expect(result.basis).toBe('contract documents')
    expect(result.documentCount).toBe(1)
  })

  it('ignores a contract document that has not been approved', () => {
    const unapproved = derive({
      documentKind: 'CONTRACT',
      priceFromLines: false,
      enteredOwnerAmount: 10_000_000,
      status: 'FULLY_SIGNED',
    })
    const result = originalContractValue([unapproved], 9_000_000)
    expect(result.amount).toBe(9_000_000)
    expect(result.basis).toBe('project setup')
  })

  it('adds several approved contract documents together', () => {
    const documents = [
      derive({ id: 'a', documentKind: 'CONTRACT', priceFromLines: false, enteredOwnerAmount: 6_000_000, approvedAt: D('2026-01-05') }),
      derive({ id: 'b', documentKind: 'CONTRACT', priceFromLines: false, enteredOwnerAmount: 4_000_000, approvedAt: D('2026-02-05') }),
    ]
    expect(originalContractValue(documents, 0).amount).toBe(10_000_000)
  })
})
