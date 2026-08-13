import { describe, expect, it } from 'vitest'
import { buildBidBuildUp, deriveEstimateItem, type EstimateFactors, type EstimateItemInput } from './estimate'

/**
 * Whether floating point is costing this system anything.
 *
 * Every dollar here is a double, which is the ordinary choice and usually the
 * right one: a double carries fifteen significant digits, and a contract value
 * with cents needs about twelve. But "usually right" is not an answer for a
 * system that decides what a company invoices, so this measures it instead of
 * assuming.
 *
 * The method: run the same arithmetic a second time in exact decimal, using
 * integers scaled by a fixed number of places so nothing is ever rounded on the
 * way, and compare. A disagreement above half a cent would mean the engine's
 * answer is not the answer, and would be a reason to move the whole schema to
 * integer cents. These tests exist to catch that if it ever becomes true.
 */

/**
 * Exact decimal arithmetic, as integers scaled by 10^SCALE.
 *
 * Written as `BigInt(...)` rather than with `n` literals because the project
 * targets ES2017, and the target is not worth moving for a test.
 */
const SCALE = 12
const ONE = BigInt(10) ** BigInt(SCALE)
const HALF = ONE / BigInt(2)
const HUNDRED = BigInt(100)
const ZERO = BigInt(0)

/** Parses a decimal literal exactly, without going through a double. */
function exact(literal: string): bigint {
  const negative = literal.startsWith('-')
  const [whole, fraction = ''] = literal.replace('-', '').split('.')
  const padded = (fraction + '0'.repeat(SCALE)).slice(0, SCALE)
  const value = BigInt(whole) * ONE + BigInt(padded || '0')
  return negative ? -value : value
}

function mul(a: bigint, b: bigint): bigint {
  return (a * b) / ONE
}

/** Back to a number, rounded to the cent, which is what a person is shown. */
function toCents(value: bigint): number {
  const cents = (value * HUNDRED + (value < ZERO ? -HALF : HALF)) / ONE
  return Number(cents) / 100
}

describe('precision: the markup chain worked in exact decimal', () => {
  /*
    The chain from the sample bid, in the bid summary's own order. Every
    percentage is written here as the literal a person typed, so the exact
    version never sees a double at all.
  */
  const direct = exact('1284650.00')
  const smallTools = exact('0.03')
  const contingency = exact('0.05')
  const overhead = exact('0.08')
  const profit = exact('0.10')
  const insurance = exact('0.0125')
  const bond = exact('0.011')
  const excise = exact('0.00484')
  const laborCost = exact('412300.00')

  it('agrees with the engine to the cent', () => {
    // Exact.
    const tools = mul(laborCost, smallTools)
    const afterTools = direct + tools
    const contingencyAmount = mul(afterTools, contingency)
    const costSubtotal = afterTools + contingencyAmount
    const overheadAmount = mul(costSubtotal, overhead)
    const profitAmount = mul(costSubtotal + overheadAmount, profit)
    const subtotal = costSubtotal + overheadAmount + profitAmount
    const total =
      subtotal + mul(subtotal, insurance) + mul(subtotal, bond) + mul(subtotal, excise)

    // The engine, in doubles.
    const built = buildBidBuildUp({
      directCost: 1_284_650,
      laborCost: 412_300,
      smallToolsPct: 0.03,
      contingencyPct: 0.05,
      overheadPct: 0.08,
      profitPct: 0.1,
      glInsurancePct: 0.0125,
      bondPct: 0.011,
      exciseTaxPct: 0.00484,
      roundToNearest: 0,
    })

    expect(built.costSubtotal).toBeCloseTo(toCents(costSubtotal), 2)
    expect(built.totalBid).toBeCloseTo(toCents(total), 2)
  })

  it('stays within half a cent over a thousand compounding steps', () => {
    /*
      A pathological case on purpose: a thousand markups compounded onto one
      another. Nothing in the system does this, and if the error is still under
      half a cent here it is not going to appear on a real bid.
    */
    let float = 1_284_650
    let precise = direct
    const step = exact('0.017')
    for (let round = 0; round < 1_000; round++) {
      float = float * 1.017
      precise = precise + mul(precise, step)
    }
    // Relative, because the figure by then is astronomically large. A tenth of
    // a part per million is far tighter than any money question needs.
    const relative = Math.abs(float - toCents(precise)) / toCents(precise)
    expect(relative).toBeLessThan(1e-7)
  })
})

describe('precision: a takeoff of many lines', () => {
  const factors: EstimateFactors = {
    laborBurdenPct: 0.34,
    salesTaxPct: 0.086,
    smallToolsPct: 0.03,
    laborRates: new Map([['Carpenter', { rate: 52, burdened: false }]]),
  }

  const line = (index: number): EstimateItemInput => ({
    id: `line-${index}`,
    sectionId: null,
    divisionCode: '06',
    description: `line ${index}`,
    measure: 'SF',
    count: 1,
    // Deliberately awkward numbers: thirds and sevenths do not sit in binary.
    length: 33.33 + index / 7,
    width: 12.7,
    depth: 0,
    netQtyOverride: null,
    uom: 'SF',
    wastePct: 0.07,
    laborClass: 'Carpenter',
    laborHrsPerUnit: 0.031,
    laborRateOverride: null,
    materialUnitCost: 4.37,
    equipmentUnitCost: 0.19,
    subUnitCost: 0,
    notes: null,
  })

  it('adds five hundred awkward lines without drifting off the cent', () => {
    const lines = Array.from({ length: 500 }, (_, index) => deriveEstimateItem(line(index), factors))

    // Summed left to right, the way the engine does it.
    const straight = lines.reduce((total, item) => total + item.totalCost, 0)

    /*
      Summed again from the smallest to the largest. Adding a tiny number to a
      very large one is where a double loses the most, so if the order of
      addition changes the answer, that is the drift showing.
    */
    const smallestFirst = [...lines]
      .map((item) => item.totalCost)
      .sort((a, b) => a - b)
      .reduce((total, value) => total + value, 0)

    expect(Math.abs(straight - smallestFirst)).toBeLessThan(0.005)
  })

  it('reaches the same total whether the lines are added forwards or backwards', () => {
    const values = Array.from({ length: 500 }, (_, index) => deriveEstimateItem(line(index), factors).totalCost)
    const forwards = values.reduce((total, value) => total + value, 0)
    const backwards = [...values].reverse().reduce((total, value) => total + value, 0)
    expect(Math.abs(forwards - backwards)).toBeLessThan(0.005)
  })
})
