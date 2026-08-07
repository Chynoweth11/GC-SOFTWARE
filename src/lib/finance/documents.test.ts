import { describe, expect, it } from 'vitest'
import {
  contractChangeDocuments,
  deriveDocument,
  documentTotals,
  isOfficial,
  originalContractValue,
  timeAndMaterialsSummary,
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
  rollsUpToId: null,
  rollsUpToNumber: null,
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

/**
 * Time and materials tickets are signed a day at a time and then rolled into a
 * change order for billing. The one thing that must not happen is both counting.
 */
describe('time and materials tickets', () => {
  const ticket = (over: Partial<DocumentInput> = {}) =>
    derive({
      documentKind: 'TIME_AND_MATERIALS',
      priceFromLines: false,
      status: 'FULLY_SIGNED',
      signatures: [{ party: "Owner's representative", status: 'SIGNED', signedAt: D('2026-03-02') }],
      ...over,
    })

  it('bills on its own when it is not rolled up', () => {
    const standalone = ticket({ enteredOwnerAmount: 4_200, approvedAt: D('2026-03-05') })
    expect(standalone.countsTowardContract).toBe(true)
    expect(standalone.isRolledUp).toBe(false)
    expect(contractChangeDocuments([standalone])).toHaveLength(1)
  })

  it('counts for nothing on its own once it is billed under a change order', () => {
    const rolled = ticket({
      enteredOwnerAmount: 4_200,
      approvedAt: D('2026-03-05'),
      rollsUpToId: 'co-1',
      rollsUpToNumber: 'CO-014',
    })
    expect(rolled.isRolledUp).toBe(true)
    expect(rolled.countsTowardContract).toBe(false)
    expect(contractChangeDocuments([rolled])).toHaveLength(0)
    expect(rolled.issues.some((issue) => issue.includes('Billed under CO-014'))).toBe(true)
  })

  /** The double count this exists to prevent, shown end to end. */
  it('does not let the same work reach the contract value twice', () => {
    const parent = derive({ id: 'co-1', number: 'CO-014', priceFromLines: false, enteredOwnerAmount: 12_600, approvedAt: D('2026-03-10') })
    const tickets = [
      ticket({ id: 't1', enteredOwnerAmount: 4_200, approvedAt: D('2026-03-05'), rollsUpToId: 'co-1', rollsUpToNumber: 'CO-014' }),
      ticket({ id: 't2', enteredOwnerAmount: 4_200, approvedAt: D('2026-03-06'), rollsUpToId: 'co-1', rollsUpToNumber: 'CO-014' }),
      ticket({ id: 't3', enteredOwnerAmount: 4_200, approvedAt: D('2026-03-07'), rollsUpToId: 'co-1', rollsUpToNumber: 'CO-014' }),
    ]
    const counted = contractChangeDocuments([parent, ...tickets])
    expect(counted.map((document) => document.number)).toEqual(['CO-014'])
    expect(counted.reduce((total, document) => total + document.ownerAmount, 0)).toBe(12_600)
  })

  it('warns about a ticket nobody signed for on the day', () => {
    const unsigned = ticket({ status: 'DRAFT', signatures: [], enteredOwnerAmount: 900 })
    expect(unsigned.issues.some((issue) => issue.includes('worth what somebody signed for'))).toBe(true)
  })

  it('summarises what is rolled up against what is billed on its own', () => {
    const documents = [
      ticket({ id: 't1', enteredOwnerAmount: 4_200, rollsUpToId: 'co-1', rollsUpToNumber: 'CO-014' }),
      ticket({ id: 't2', enteredOwnerAmount: 3_000 }),
      ticket({ id: 't3', enteredOwnerAmount: 1_500, status: 'DRAFT', signatures: [] }),
    ]
    const summary = timeAndMaterialsSummary(documents)

    expect(summary.count).toBe(3)
    expect(summary.entered).toBe(8_700)
    expect(summary.rolledUp).toBe(4_200)
    expect(summary.standalone).toBe(4_500)
    expect(summary.unsignedCount).toBe(1)
    expect(summary.unsignedValue).toBe(1_500)
  })

  it('adds up the hours behind the tickets, which is what they are made of', () => {
    const priced = derive(
      { documentKind: 'TIME_AND_MATERIALS', status: 'FULLY_SIGNED' },
      [
        line({ measure: 'EA', count: 1, length: 0, width: 0, laborHrsPerUnit: 12, laborRateOverride: 68 }),
        line({ id: 'l2', measure: 'EA', count: 1, length: 0, width: 0, equipmentHrsPerUnit: 6, equipmentRateOverride: 162 }),
      ],
    )
    const summary = timeAndMaterialsSummary([priced])
    expect(summary.laborHours).toBe(12)
    expect(summary.equipmentHours).toBe(6)
  })

  it('counts the totals on the tab whether a ticket is rolled up or not', () => {
    // The tab still says what has been raised; only the contract value differs.
    const documents = [
      ticket({ id: 't1', enteredOwnerAmount: 4_200, approvedAt: D('2026-03-05'), rollsUpToId: 'co-1', rollsUpToNumber: 'CO-014' }),
      ticket({ id: 't2', enteredOwnerAmount: 3_000, approvedAt: D('2026-03-06') }),
    ]
    const totals = documentTotals(documents)
    expect(totals.entered).toBe(7_200)
    expect(totals.rolledUp).toBe(4_200)
    expect(totals.rolledUpCount).toBe(1)
  })
})

describe('pricing equipment on a line', () => {
  it('runs a machine at hours times its rate, the way labor is priced', () => {
    const rates = new Map<string, number>([['Excavator, 30 tonne', 162]])
    const document = deriveDocument(
      doc(),
      [line({ measure: 'EA', count: 10, length: 0, width: 0, equipmentClass: 'Excavator, 30 tonne', equipmentHrsPerUnit: 2 })],
      new Map(),
      DATA_DATE,
      rates,
    )
    expect(document.lines[0].equipmentHours).toBe(20)
    expect(document.lines[0].equipmentRate).toBe(162)
    expect(document.lines[0].equipmentCost).toBe(20 * 162)
  })

  it('adds a unit cost and an hourly machine together on the same line', () => {
    const rates = new Map<string, number>([['Excavator, 30 tonne', 162]])
    const document = deriveDocument(
      doc(),
      [
        line({
          measure: 'EA',
          count: 10,
          length: 0,
          width: 0,
          equipmentUnitCost: 40,
          equipmentClass: 'Excavator, 30 tonne',
          equipmentHrsPerUnit: 2,
        }),
      ],
      new Map(),
      DATA_DATE,
      rates,
    )
    expect(document.lines[0].equipmentCost).toBe(10 * 40 + 20 * 162)
  })

  it('uses a rate typed onto the line over the equipment list', () => {
    const rates = new Map<string, number>([['Excavator, 30 tonne', 162]])
    const document = deriveDocument(
      doc(),
      [
        line({
          measure: 'EA',
          count: 1,
          length: 0,
          width: 0,
          equipmentClass: 'Excavator, 30 tonne',
          equipmentHrsPerUnit: 8,
          equipmentRateOverride: 140,
        }),
      ],
      new Map(),
      DATA_DATE,
      rates,
    )
    expect(document.lines[0].equipmentCost).toBe(8 * 140)
  })
})
