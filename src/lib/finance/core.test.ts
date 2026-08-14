import { describe, expect, it } from 'vitest'
import { clamp, clampPct, money, mround, num, round, safeDiv, sum, sumBy } from './core'

/**
 * The primitives every figure in this system rests on.
 *
 * These were the last modules without tests of their own, covered only by
 * everything above them happening to work. That is the wrong way round: a
 * mistake in `safeDiv` or `round` does not fail loudly in one place, it shifts
 * every margin, every percentage and every total by a little, which is exactly
 * the kind of error a reconciliation never finds.
 */

describe('core: dividing by nothing', () => {
  it('returns zero rather than infinity, which is what the workbooks did', () => {
    expect(safeDiv(100, 0)).toBe(0)
  })

  it('takes a stated fallback when zero would be misleading', () => {
    // A cost performance index of 0 reads as catastrophic; 1 reads as "no data
    // yet", which is the truth when nothing has been spent.
    expect(safeDiv(0, 0, 1)).toBe(1)
  })

  it('refuses to pass NaN or infinity through', () => {
    expect(safeDiv(NaN, 5)).toBe(0)
    expect(safeDiv(5, NaN)).toBe(0)
    expect(safeDiv(Infinity, 5)).toBe(0)
    expect(safeDiv(-Infinity, 5)).toBe(0)
  })

  it('divides normally when it can', () => {
    expect(safeDiv(3, 4)).toBe(0.75)
    expect(safeDiv(-10, 4)).toBe(-2.5)
  })
})

describe('core: a missing number is nothing, not a broken total', () => {
  it('treats null, undefined and NaN as zero', () => {
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num(NaN)).toBe(0)
    expect(num(Infinity)).toBe(0)
  })

  it('leaves a real number alone, including a negative one', () => {
    expect(num(0)).toBe(0)
    expect(num(-42.5)).toBe(-42.5)
  })

  it('means a half-filled record cannot poison a total', () => {
    expect(sum([1, 2, NaN as number, 3])).toBe(6)
    expect(sumBy([{ v: 1 }, { v: null }, { v: 3 }], (row) => row.v)).toBe(4)
  })

  it('adds nothing to nothing without complaint', () => {
    expect(sum([])).toBe(0)
    expect(sumBy([], () => 1)).toBe(0)
  })
})

describe('core: rounding the way the workbooks round', () => {
  /*
    Excel's ROUND is half away from zero. JavaScript's Math.round is half up,
    which disagrees on every negative half: Math.round(-0.5) is -0 but Excel
    gives -1. Every dollar in this system goes through here, so the difference
    is not academic.
  */
  it('rounds a half away from zero, in both directions', () => {
    expect(round(0.5, 0)).toBe(1)
    expect(round(-0.5, 0)).toBe(-1)
    expect(round(2.5, 0)).toBe(3)
    expect(round(-2.5, 0)).toBe(-3)
  })

  it('rounds money to the cent', () => {
    expect(money(1.234)).toBe(1.23)
    expect(money(1.236)).toBe(1.24)
    expect(money(-1.236)).toBe(-1.24)
    expect(money(1234.5649)).toBe(1234.56)
  })

  /*
    A literal that looks like an exact half usually is not one.

    `1.005` cannot be represented in binary. The nearest double is
    1.00499999999999989, and multiplied by a hundred it is 100.49999999999999,
    genuinely below the halfway point, so it rounds down. `2.675` is equally
    unrepresentable but its product lands on exactly 267.5, so it rounds up.
    Neither is a bug: the function rounds the number it was given, and which way
    a typed decimal goes depends on where its nearest double falls.

    Written down rather than papered over. Nudging with an epsilon to make these
    agree with a spreadsheet would round a genuine 1.00499 up as well, and a
    system that quietly moves money upward is worse than one that differs by a
    cent on a literal no computed figure ever lands on. Every derived value here
    comes out of arithmetic, and the whole system compares to half a cent.
  */
  it('rounds the double it was given, not the decimal it looks like', () => {
    expect(money(1.005)).toBe(1)
    expect(money(1.015)).toBe(1.01)
    expect(money(2.675)).toBe(2.68)
  })

  it('gives zero for a figure that is not a number', () => {
    expect(round(NaN)).toBe(0)
    expect(money(Infinity)).toBe(0)
  })
})

describe('core: rounding a bid to a round number', () => {
  it('rounds to the nearest multiple, as Excel MROUND does', () => {
    expect(mround(1_284_650, 1_000)).toBe(1_285_000)
    expect(mround(1_284_400, 1_000)).toBe(1_284_000)
    expect(mround(87.3, 0.05)).toBeCloseTo(87.3, 10)
  })

  it('leaves the figure alone when no rounding was asked for', () => {
    // Zero is the default on every document, and it has to mean "as computed"
    // rather than dividing by nothing.
    expect(mround(1_284_650.37, 0)).toBe(1_284_650.37)
  })
})

describe('core: keeping a percentage honest', () => {
  it('holds a fraction between nothing and everything', () => {
    expect(clampPct(-0.2)).toBe(0)
    expect(clampPct(1.4)).toBe(1)
    expect(clampPct(0.63)).toBe(0.63)
  })

  it('reads a missing percent complete as nothing done', () => {
    expect(clampPct(NaN)).toBe(0)
  })

  it('clamps to any stated range', () => {
    expect(clamp(5, 1, 3)).toBe(3)
    expect(clamp(-5, 1, 3)).toBe(1)
    expect(clamp(2, 1, 3)).toBe(2)
  })
})
