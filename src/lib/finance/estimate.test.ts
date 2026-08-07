import { describe, expect, it } from 'vitest'
import {
  buildBidBuildUp,
  deriveEstimateItem,
  deriveGeneralCondition,
  deriveNetQuantity,
  summarizeEstimate,
  type EstimateFactors,
  type EstimateItemInput,
} from './estimate'

const factors: EstimateFactors = {
  laborBurdenPct: 0.34,
  salesTaxPct: 0.086,
  smallToolsPct: 0.03,
  // Bare wages typed onto the estimate, which is what the workbook held, so
  // the flat labor burden percentage applies on top of each of them.
  laborRates: new Map(
    ([
      ['Foreman', 68],
      ['Carpenter', 52],
      ['Laborer', 38],
      ['Operator', 62],
      ['Finisher', 55],
      ['PM/Super', 75],
    ] as const).map(([className, rate]) => [className, { rate, burdened: false }]),
  ),
}

const item = (over: Partial<EstimateItemInput> = {}): EstimateItemInput => ({
  id: 'i',
  sectionId: null,
  divisionCode: '06 Wood, Plastics & Composites',
  description: 'test',
  measure: 'SF',
  count: 0,
  length: 0,
  width: 0,
  depth: 0,
  netQtyOverride: null,
  uom: null,
  wastePct: 0,
  laborClass: 'Carpenter',
  laborHrsPerUnit: 0,
  laborRateOverride: null,
  materialUnitCost: 0,
  equipmentUnitCost: 0,
  subUnitCost: 0,
  ...over,
})

describe('quantity derivation: Takeoff column I', () => {
  it('each measure applies its own dimensional formula', () => {
    expect(deriveNetQuantity({ measure: 'EA', count: 12, length: 5, width: 5, depth: 5 })).toBe(12)
    expect(deriveNetQuantity({ measure: 'LF', count: 3, length: 40, width: 0, depth: 0 })).toBe(120)
    expect(deriveNetQuantity({ measure: 'SF', count: 2, length: 10, width: 8, depth: 0 })).toBe(160)
    expect(deriveNetQuantity({ measure: 'SY', count: 1, length: 30, width: 30, depth: 0 })).toBe(100)
    expect(deriveNetQuantity({ measure: 'CY', count: 1, length: 30, width: 30, depth: 1 })).toBeCloseTo(33.3333333, 6)
    expect(deriveNetQuantity({ measure: 'CF', count: 1, length: 3, width: 3, depth: 3 })).toBe(27)
  })

  it('lump sum is at least one unit even when nothing is entered', () => {
    expect(deriveNetQuantity({ measure: 'LS', count: 0, length: 0, width: 0, depth: 0 })).toBe(1)
    expect(deriveNetQuantity({ measure: 'ALLOWANCE', count: 0, length: 0, width: 0, depth: 0 })).toBe(1)
  })

  it('an explicit quantity override wins over the dimensions', () => {
    const derived = deriveEstimateItem(item({ measure: 'SF', count: 2, length: 10, width: 8, netQtyOverride: 500 }), factors)
    expect(derived.netQty).toBe(500)
  })
})

describe('line pricing: Takeoff L,P,R,T,V,W', () => {
  it('waste inflates the quantity everything else prices from', () => {
    const derived = deriveEstimateItem(item({ measure: 'SF', count: 1, length: 100, width: 10, wastePct: 0.1 }), factors)
    expect(derived.netQty).toBe(1_000)
    expect(derived.grossQty).toBeCloseTo(1_100, 6)
  })

  it('labor is burdened and material is taxed', () => {
    const derived = deriveEstimateItem(
      item({ measure: 'SF', count: 1, length: 100, width: 10, laborHrsPerUnit: 0.02, materialUnitCost: 3.25 }),
      factors,
    )
    // 1,000 SF × 0.02 hr × $52 × 1.34
    expect(derived.laborHours).toBeCloseTo(20, 6)
    expect(derived.laborRate).toBe(52)
    expect(derived.laborCost).toBeCloseTo(1_393.6, 4)
    // 1,000 SF × $3.25 × 1.086
    expect(derived.materialCost).toBeCloseTo(3_529.5, 4)
    expect(derived.totalCost).toBeCloseTo(1_393.6 + 3_529.5, 4)
  })

  it('a rate override bypasses the labor-class table', () => {
    const derived = deriveEstimateItem(item({ measure: 'HR', count: 10, laborHrsPerUnit: 1, laborRateOverride: 95 }), factors)
    expect(derived.laborRate).toBe(95)
    expect(derived.laborCost).toBeCloseTo(10 * 95 * 1.34, 6)
  })

  it('unit cost is the total spread over the gross quantity', () => {
    const derived = deriveEstimateItem(item({ measure: 'EA', count: 4, subUnitCost: 250 }), factors)
    expect(derived.subCost).toBe(1_000)
    expect(derived.unitCost).toBe(250)
  })
})

/**
 * The one rule that keeps the classification library from breaking every bid it
 * touches. A library rate arrives with its own burden already in it.
 */
describe('line pricing: burden is charged once and only once', () => {
  const line = {
    id: 'x',
    sectionId: null,
    divisionCode: '06',
    description: 'Blocking',
    measure: 'LF' as const,
    count: 100,
    length: 1,
    width: 0,
    depth: 0,
    netQtyOverride: null,
    uom: 'LF',
    wastePct: 0,
    laborClass: 'Carpenter',
    laborHrsPerUnit: 0.1,
    laborRateOverride: null,
    materialUnitCost: 0,
    equipmentUnitCost: 0,
    subUnitCost: 0,
  }

  it('adds the flat burden to a bare rate typed onto the estimate', () => {
    const derived = deriveEstimateItem(line, {
      laborBurdenPct: 0.34,
      salesTaxPct: 0,
      smallToolsPct: 0,
      laborRates: new Map([['Carpenter', { rate: 52, burdened: false }]]),
    })
    expect(derived.laborRateBurdened).toBe(false)
    expect(derived.laborCost).toBeCloseTo(10 * 52 * 1.34, 8)
  })

  it('leaves a rate from the classification library alone, because it already carries its own', () => {
    const derived = deriveEstimateItem(line, {
      laborBurdenPct: 0.34,
      salesTaxPct: 0,
      smallToolsPct: 0,
      laborRates: new Map([['Carpenter', { rate: 65.9, burdened: true, source: 'Classification library' }]]),
    })
    expect(derived.laborRateBurdened).toBe(true)
    expect(derived.laborCost).toBeCloseTo(10 * 65.9, 8)
    // The mistake this guards against: 65.90 x 1.34 is 88.31 an hour for a
    // carpenter whose real loaded cost is 65.90, a third too much on every
    // labor line in the bid.
    expect(derived.laborCost).not.toBeCloseTo(10 * 65.9 * 1.34, 2)
    expect(derived.laborRateSource).toBe('Classification library')
  })

  it('treats a rate typed onto the line as bare, whatever the class carries', () => {
    const derived = deriveEstimateItem(
      { ...line, laborRateOverride: 60 },
      {
        laborBurdenPct: 0.34,
        salesTaxPct: 0,
        smallToolsPct: 0,
        laborRates: new Map([['Carpenter', { rate: 65.9, burdened: true }]]),
      },
    )
    expect(derived.laborRateBurdened).toBe(false)
    expect(derived.laborCost).toBeCloseTo(10 * 60 * 1.34, 8)
    expect(derived.laborRateSource).toBe('Rate entered on this line')
  })
})

describe('QA flags: Takeoff column X', () => {
  it('an untouched row raises nothing', () => {
    expect(deriveEstimateItem(item(), factors).qaFlags).toEqual([])
  })

  it('a priced row with no division is flagged', () => {
    const derived = deriveEstimateItem(item({ divisionCode: null, count: 5, subUnitCost: 100 }), factors)
    expect(derived.qaFlags).toContain('Missing CSI division')
  })

  it('labor hours without a labor class is flagged', () => {
    const derived = deriveEstimateItem(item({ count: 5, laborClass: null, laborHrsPerUnit: 2 }), factors)
    expect(derived.qaFlags).toContain('Labor hours without a labor class')
  })

  it('a quantity carried with no price is flagged as uncosted', () => {
    const derived = deriveEstimateItem(item({ measure: 'LF', count: 1, length: 100, laborHrsPerUnit: 0, materialUnitCost: 0, subUnitCost: 0, equipmentUnitCost: 0, laborClass: null }), factors)
    expect(derived.netQty).toBe(100)
    expect(derived.qaFlags).toContain('No cost priced')
  })

  it('a labor class with no rate in the table is flagged', () => {
    const derived = deriveEstimateItem(item({ count: 5, laborClass: 'Ironworker', laborHrsPerUnit: 2, measure: 'EA' }), factors)
    expect(derived.qaFlags).toContain('Labor class has no rate')
  })
})

describe('general conditions: duration-driven quantities', () => {
  it('weekly items requantify when the duration changes', () => {
    const gc = { id: 'g', item: 'Superintendent', basis: 'WK', qty: 0, followsDuration: true, unitCost: 2_850 }
    expect(deriveGeneralCondition(gc, 22).total).toBe(62_700)
    expect(deriveGeneralCondition(gc, 26).total).toBe(74_100)
  })

  it('fixed items ignore the duration', () => {
    const gc = { id: 'g', item: 'Final clean', basis: 'LS', qty: 1, followsDuration: false, unitCost: 4_200 }
    expect(deriveGeneralCondition(gc, 22).total).toBe(4_200)
  })
})

describe('markup chain: Bid Summary G5:G16', () => {
  /** Reproduces the sample bid B-26-014 exactly. */
  const buildUp = buildBidBuildUp({
    directCost: 661_341.68866,
    laborCost: 112_544.422768,
    smallToolsPct: 0.03,
    contingencyPct: 0.03,
    overheadPct: 0.06,
    profitPct: 0.1,
    glInsurancePct: 0.012,
    bondPct: 0.01,
    exciseTaxPct: 0.005,
    roundToNearest: 500,
  })

  it('each step matches the workbook to the cent', () => {
    expect(buildUp.smallTools).toBeCloseTo(3_376.33268304, 6)
    expect(buildUp.contingency).toBeCloseTo(19_941.5406402912, 6)
    expect(buildUp.costSubtotal).toBeCloseTo(684_659.561983331, 6)
    expect(buildUp.overhead).toBeCloseTo(41_079.5737189999, 6)
    expect(buildUp.profit).toBeCloseTo(72_573.9135702331, 6)
    expect(buildUp.subtotal).toBeCloseTo(798_313.049272564, 6)
    expect(buildUp.glInsurance).toBeCloseTo(9_579.75659127077, 6)
    expect(buildUp.bond).toBeCloseTo(7_983.13049272564, 6)
    expect(buildUp.exciseTax).toBeCloseTo(3_991.56524636282, 6)
  })

  it('total and rounded bid match the workbook', () => {
    expect(buildUp.totalBid).toBeCloseTo(819_867.5, 1)
    expect(buildUp.roundedBid).toBe(820_000)
  })

  it('gross margin on the bid matches the workbook', () => {
    expect(buildUp.grossMarginOnBid).toBeCloseTo(0.164914378671245, 10)
  })

  it('markups compound in order: profit is taken on cost plus overhead', () => {
    const step = buildUp.steps.find((s) => s.label === 'Profit')!
    expect(step.basis).toBe('Cost subtotal + overhead')
    expect(step.amount).toBeCloseTo((buildUp.costSubtotal + buildUp.overhead) * 0.1, 6)
  })

  it('every step is exposed so the number can be explained', () => {
    expect(buildUp.steps.map((s) => s.label)).toContain('TOTAL BID')
    expect(buildUp.steps.filter((s) => s.isSubtotal).length).toBe(3)
  })

  it('zeroed markups leave the direct cost untouched', () => {
    const flat = buildBidBuildUp({
      directCost: 100_000,
      laborCost: 40_000,
      smallToolsPct: 0,
      contingencyPct: 0,
      overheadPct: 0,
      profitPct: 0,
      glInsurancePct: 0,
      bondPct: 0,
      exciseTaxPct: 0,
      roundToNearest: 0,
    })
    expect(flat.totalBid).toBe(100_000)
    expect(flat.roundedBid).toBe(100_000)
  })

  it('fixed-dollar adders sit alongside the percentage chain', () => {
    const withPermit = buildBidBuildUp({
      directCost: 100_000,
      laborCost: 0,
      smallToolsPct: 0,
      contingencyPct: 0,
      overheadPct: 0,
      profitPct: 0,
      glInsurancePct: 0,
      bondPct: 0,
      exciseTaxPct: 0,
      roundToNearest: 0,
      fixedAdders: [{ label: 'Permit allowance', amount: 12_500 }],
    })
    expect(withPermit.totalBid).toBe(112_500)
    expect(withPermit.steps.some((s) => s.label === 'Permit allowance')).toBe(true)
  })
})

describe('estimate summary', () => {
  it('rolls sections, divisions and cost mix off the same lines', () => {
    const summary = summarizeEstimate({
      items: [
        item({ id: 'a', sectionId: 'sec1', sectionName: 'Concrete', divisionCode: '03', measure: 'CY', count: 1, length: 30, width: 30, depth: 1, materialUnitCost: 180, laborHrsPerUnit: 1.2 }),
        item({ id: 'b', sectionId: 'sec2', sectionName: 'MEP', divisionCode: '22', measure: 'LS', subUnitCost: 64_800 }),
      ],
      gcItems: [{ id: 'g', item: 'Superintendent', basis: 'WK', qty: 0, followsDuration: true, unitCost: 2_850 }],
      factors,
      durationWeeks: 22,
      buildingAreaSf: 8_400,
      smallToolsPct: 0.03,
      markups: {
        contingencyPct: 0.03,
        overheadPct: 0.06,
        profitPct: 0.1,
        glInsurancePct: 0.012,
        bondPct: 0.01,
        exciseTaxPct: 0.005,
        roundToNearest: 500,
      },
      pendingQuotes: 1,
      quoteVarianceRows: 0,
    })

    expect(summary.gcTotal).toBe(62_700)
    expect(summary.directCost).toBeCloseTo(summary.takeoffTotal + summary.gcTotal, 6)
    expect(summary.bySection.some((s) => s.label === 'General Conditions')).toBe(true)
    expect(summary.byDivision.map((d) => d.key)).toContain('22')
    expect(summary.costMix.subcontract).toBe(64_800)
    expect(summary.metrics.directCostPerSf).toBeCloseTo(summary.directCost / 8_400, 8)
    expect(summary.qa.issues.some((i) => i.includes('pending'))).toBe(true)
  })

  it('section percentages sum to one across the direct cost', () => {
    const summary = summarizeEstimate({
      items: [
        item({ id: 'a', sectionId: 's1', sectionName: 'A', subUnitCost: 100, measure: 'EA', count: 10 }),
        item({ id: 'b', sectionId: 's2', sectionName: 'B', subUnitCost: 300, measure: 'EA', count: 10 }),
      ],
      gcItems: [],
      factors,
      durationWeeks: 0,
      buildingAreaSf: 0,
      smallToolsPct: 0,
      markups: { contingencyPct: 0, overheadPct: 0, profitPct: 0, glInsurancePct: 0, bondPct: 0, exciseTaxPct: 0, roundToNearest: 0 },
      pendingQuotes: 0,
      quoteVarianceRows: 0,
    })
    const total = summary.bySection.reduce((a, s) => a + s.pctOfDirect, 0)
    expect(total).toBeCloseTo(1, 10)
  })
})
