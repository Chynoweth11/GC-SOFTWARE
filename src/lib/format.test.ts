import { describe, expect, it } from 'vitest'
import { decimal, hours, money, moneyShort, number, percent, quantity } from './format'

/**
 * How a figure is written down.
 *
 * Formatting is not cosmetic in a system like this. A quantity written to the
 * nearest whole number is a quantity somebody will act on as though it were
 * whole, and a whole number written with a decimal place claims a precision
 * nobody measured. Both are lies of a kind, and both are cheap to get right.
 */

describe('format: a measured figure keeps the decimals it has', () => {
  it('writes a whole number as a whole number', () => {
    expect(hours(7)).toBe('7')
    expect(hours(0)).toBe('0')
    expect(quantity(1200)).toBe('1,200')
  })

  it('keeps a half hour, a quarter hour and a tenth', () => {
    expect(hours(7.5)).toBe('7.5')
    expect(hours(7.25)).toBe('7.25')
    expect(hours(7.1)).toBe('7.1')
  })

  it('keeps the thousands separator, because a five figure quantity is misread without it', () => {
    expect(hours(12_480.5)).toBe('12,480.5')
  })

  it('holds a takeoff quantity to three places, for the thirds a cubic yard lands on', () => {
    expect(quantity(33.333)).toBe('33.333')
    expect(quantity(1.5)).toBe('1.5')
  })

  it('stops inventing precision past the limit', () => {
    expect(hours(7.256789)).toBe('7.26')
    expect(quantity(33.333333)).toBe('33.333')
  })

  it('says nothing rather than NaN when there is no figure', () => {
    expect(hours(null)).toBe('-')
    expect(hours(undefined)).toBe('-')
    expect(hours(NaN)).toBe('-')
    expect(quantity(Infinity)).toBe('-')
  })

  it('takes a stated limit when a caller wants a different one', () => {
    expect(decimal(7.129, 1)).toBe('7.1')
    expect(decimal(7, 4)).toBe('7')
  })

  it('keeps a negative reading as a negative', () => {
    expect(hours(-3.5)).toBe('-3.5')
  })
})

describe('format: the difference from a fixed-places figure', () => {
  /*
    The two exist for different jobs. `number` is for a count, where a decimal
    place would be nonsense and a fixed width lines a column up. `decimal` is
    for a measurement, where the places are data.
  */
  it('a count is written flat, with no decimals invented', () => {
    expect(number(7)).toBe('7')
    expect(number(1200)).toBe('1,200')
  })

  it('a count asked for one place gets one, whether it needs it or not', () => {
    expect(number(7, 1)).toBe('7.0')
  })

  it('a measurement is not padded to a fixed width', () => {
    expect(decimal(7, 1)).toBe('7')
  })

  it('and a measurement does not lose a quarter the way a rounded count would', () => {
    expect(number(7.25, 0)).toBe('7')
    expect(hours(7.25)).toBe('7.25')
  })
})

describe('format: money', () => {
  it('writes a negative in brackets, the way an accountant reads it', () => {
    expect(money(-1234)).toBe('($1,234)')
  })

  it('shows cents only when asked', () => {
    expect(money(1234.56)).toBe('$1,235')
    expect(money(1234.56, { cents: true })).toBe('$1,234.56')
  })

  it('writes nothing as a dash, so an empty cell reads as empty', () => {
    expect(money(0)).toBe('-')
    expect(money(null)).toBe('-')
  })

  it('shows a zero when a zero is the point', () => {
    expect(money(0, { dash: false })).toBe('$0')
  })

  /*
    More decimals on the smaller figure, not fewer.

    A tile reading "$2.5M" hides fifty thousand dollars; "$2.45M" does not, and
    it is no wider. The places fall away only once the figure is large enough
    that they stop meaning anything: past ten million a hundredth of a million
    is noise, and past a hundred thousand a tenth of a thousand is.
  */
  it('shortens a large figure for a tile without throwing away what it is worth', () => {
    expect(moneyShort(2_450_000)).toBe('$2.45M')
    expect(moneyShort(24_500_000)).toBe('$24.5M')
    expect(moneyShort(842_000)).toBe('$842K')
    expect(moneyShort(8_420)).toBe('$8.4K')
    expect(moneyShort(-1_200_000)).toBe('-$1.20M')
  })
})

describe('format: percentages', () => {
  it('carries one decimal by default, because a tenth of a point is money on a big job', () => {
    expect(percent(0.0834)).toBe('8.3%')
  })

  it('takes a stated precision', () => {
    expect(percent(0.0834, 2)).toBe('8.34%')
    expect(percent(0.0834, 0)).toBe('8%')
  })

  it('says nothing rather than NaN', () => {
    expect(percent(null)).toBe('-')
    expect(percent(Infinity)).toBe('-')
  })
})
