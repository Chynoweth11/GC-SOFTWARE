import { describe, expect, it } from 'vitest'
import {
  barWidths,
  coord,
  donutArcs,
  donutPath,
  extentOf,
  fractionOf,
  niceTicks,
  pointOnCircle,
  sparklinePoints,
} from './geometry'

/**
 * The shapes, checked the way the money is checked.
 *
 * A wrong figure fails loudly somewhere. A wrong chart does not: the page
 * renders, the console is clean, the number printed beside it is right, and
 * only the picture lies. These are the assertions that would catch that.
 */

const TAU = Math.PI * 2

describe('charts: a donut adds up to a full turn', () => {
  it('sweeps exactly 360 degrees, however many slices', () => {
    for (const values of [[1], [1, 1], [3, 1, 1], [17, 4, 9, 2, 51]]) {
      const arcs = donutArcs(values)
      const swept = arcs.reduce((total, arc) => total + (arc.endAngle - arc.startAngle), 0)
      expect(swept).toBeCloseTo(TAU, 10)
    }
  })

  it('gives a quarter of the total exactly a quarter turn', () => {
    const [quarter] = donutArcs([25, 75])
    expect(quarter.fraction).toBe(0.25)
    expect(quarter.endAngle - quarter.startAngle).toBeCloseTo(TAU / 4, 12)
  })

  it('starts at twelve o clock, not at three', () => {
    expect(donutArcs([1, 1])[0].startAngle).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('hands each slice the exact end of the one before it, with no gap', () => {
    const arcs = donutArcs([13.7, 2.4, 55.9, 0.3])
    for (let index = 1; index < arcs.length; index++) {
      expect(arcs[index].startAngle).toBeCloseTo(arcs[index - 1].endAngle, 12)
    }
  })

  it('sets the large arc flag past half a turn and not before', () => {
    expect(donutArcs([60, 40])[0].largeArc).toBe(true)
    expect(donutArcs([50, 50])[0].largeArc).toBe(false)
    expect(donutArcs([49.9, 50.1])[0].largeArc).toBe(false)
  })

  it('shows a credit at its true size rather than eating the slice beside it', () => {
    // A negative belongs in a distribution at its magnitude; letting it
    // subtract would shrink the ring and misstate every other slice.
    const arcs = donutArcs([75, -25])
    expect(arcs[1].fraction).toBe(0.25)
    expect(arcs[0].fraction).toBe(0.75)
  })

  it('draws nothing rather than dividing by zero', () => {
    expect(donutArcs([])).toEqual([])
    expect(donutArcs([0, 0])).toEqual([])
  })

  it('keeps its fractions as fractions rather than rounding them to whole percents', () => {
    // A third is a third. Rounding it to 33% here would leave the ring a
    // degree short and the three slices visibly uneven.
    const arcs = donutArcs([1, 1, 1])
    expect(arcs[0].fraction).toBeCloseTo(1 / 3, 15)
  })
})

describe('charts: the donut path', () => {
  const [arc] = donutArcs([25, 75])

  it('closes the shape, out along the arc and back along the inner one', () => {
    const path = donutPath(arc, 180, 34)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    // Outer arc, straight line inward, inner arc back.
    expect(path.match(/A/g)).toHaveLength(2)
    expect(path).toContain('L')
  })

  it('starts on the outer radius and comes back on the inner one', () => {
    const size = 180
    const thickness = 34
    const radius = size / 2
    const start = pointOnCircle(radius, radius, arc.startAngle)
    const innerStart = pointOnCircle(radius, radius - thickness, arc.startAngle)
    const path = donutPath(arc, size, thickness)
    expect(path).toContain(`M${start.x},${start.y}`)
    expect(path).toContain(`${innerStart.x},${innerStart.y} Z`)
  })

  it('puts a point at twelve o clock directly above the centre', () => {
    const point = pointOnCircle(90, 90, -Math.PI / 2)
    expect(point.x).toBe(90)
    expect(point.y).toBe(0)
  })

  it('rounds a coordinate only at the last step, and only to a hundredth', () => {
    // Two identical renders have to produce identical markup or React reports a
    // hydration mismatch; full double precision does not survive the round trip.
    expect(coord(12.3456789)).toBe(12.35)
    expect(coord(12)).toBe(12)
    expect(coord(-0.004)).toBe(-0)
  })
})

describe('charts: axis ticks a person would have chosen', () => {
  it('steps by a round number, not by the span divided by four', () => {
    const ticks = niceTicks(0, 14_884)
    const step = ticks[1] - ticks[0]
    const magnitude = 10 ** Math.floor(Math.log10(step))
    expect([1, 2, 5, 10]).toContain(Math.round(step / magnitude))
  })

  it('brackets the data rather than cutting it off', () => {
    const ticks = niceTicks(3, 97)
    expect(ticks[0]).toBeLessThanOrEqual(3)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97 - (ticks[1] - ticks[0]))
  })

  it('is evenly spaced throughout', () => {
    const ticks = niceTicks(-250, 1_750)
    const step = ticks[1] - ticks[0]
    for (let index = 1; index < ticks.length; index++) {
      expect(ticks[index] - ticks[index - 1]).toBeCloseTo(step, 9)
    }
  })

  it('labels zero as zero, never as a speck of floating point', () => {
    const ticks = niceTicks(-500, 500)
    const zero = ticks.find((tick) => Math.abs(tick) < 1e-6)
    expect(zero).toBe(0)
    expect(Object.is(zero, -0)).toBe(false)
  })

  it('handles a range that is a fraction rather than assuming whole numbers', () => {
    // A productivity index between 0.85 and 1.15 has to get sensible ticks too.
    const ticks = niceTicks(0.85, 1.15)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks[0]).toBeLessThanOrEqual(0.85)
    expect(ticks[1] - ticks[0]).toBeLessThan(0.2)
  })

  it('gives one tick for a flat series rather than an empty axis', () => {
    expect(niceTicks(42, 42)).toEqual([42])
  })

  it('copes with the range handed to it backwards', () => {
    expect(niceTicks(100, 0)).toEqual(niceTicks(0, 100))
  })

  it('never spins on a nonsense range', () => {
    expect(niceTicks(NaN, 10)).toEqual([0])
    expect(niceTicks(0, Infinity)).toEqual([0])
  })
})

describe('charts: the span an axis covers', () => {
  it('includes zero, so a bar chart cannot exaggerate a difference', () => {
    expect(extentOf([980, 1_000, 1_020])).toEqual({ min: 0, max: 1_020 })
  })

  it('leaves zero out when asked, for a rate that lives near one', () => {
    const extent = extentOf([0.92, 1.04, 0.98], false)
    expect(extent.min).toBeCloseTo(0.92, 10)
    expect(extent.max).toBeCloseTo(1.04, 10)
  })

  it('gives a flat series a span rather than dividing by zero', () => {
    expect(extentOf([5, 5, 5], false)).toEqual({ min: 0, max: 10 })
    expect(extentOf([0, 0])).toEqual({ min: 0, max: 1 })
  })

  it('reaches below zero when the data does', () => {
    expect(extentOf([-400, 200])).toEqual({ min: -400, max: 200 })
  })

  it('ignores gaps in a series rather than reading them as zero', () => {
    // A month with no reading is not a month of no cost.
    expect(extentOf([100, null, 300, undefined], false)).toEqual({ min: 100, max: 300 })
  })

  it('falls back to a unit range when there is nothing to plot', () => {
    expect(extentOf([])).toEqual({ min: 0, max: 1 })
    expect(extentOf([NaN, null])).toEqual({ min: 0, max: 1 })
  })
})

describe('charts: where a value sits in a range', () => {
  it('places the middle in the middle, decimals and all', () => {
    expect(fractionOf(50, 0, 100)).toBe(0.5)
    expect(fractionOf(33.3, 0, 100)).toBeCloseTo(0.333, 12)
  })

  it('clamps rather than drawing outside the plot', () => {
    expect(fractionOf(150, 0, 100)).toBe(1)
    expect(fractionOf(-10, 0, 100)).toBe(0)
  })

  it('returns nothing rather than infinity on an empty range', () => {
    expect(fractionOf(5, 3, 3)).toBe(0)
  })
})

describe('charts: bar widths', () => {
  it('are proportional to the values', () => {
    expect(barWidths([100, 50, 25])).toEqual([100, 50, 25])
  })

  it('keep their decimals rather than snapping to whole percents', () => {
    const [width] = barWidths([1, 3])
    expect(width).toBeCloseTo(33.3333, 3)
  })

  it('measure a negative by its size, so a bad row is not invisible', () => {
    expect(barWidths([-80, 100])).toEqual([80, 100])
  })

  it('share one scale when told to, so two charts can be compared', () => {
    expect(barWidths([50], 200)).toEqual([25])
  })

  it('draw nothing rather than dividing by zero', () => {
    expect(barWidths([0, 0])).toEqual([0, 0])
    expect(barWidths([])).toEqual([])
  })
})

describe('charts: a sparkline', () => {
  it('spans the full width, first point to last', () => {
    const points = sparklinePoints([1, 2, 3], 88, 24)
    expect(points).toHaveLength(3)
    expect(points[0].x).toBeLessThan(points[1].x)
    expect(points[2].x).toBeGreaterThan(points[1].x)
    expect(points[2].x).toBeCloseTo(88 - 1, 1)
  })

  it('puts the largest value highest, which in SVG is the smallest y', () => {
    const [low, high] = sparklinePoints([10, 90], 88, 24)
    expect(high.y).toBeLessThan(low.y)
  })

  it('scales to its own range, so small movements are still visible', () => {
    // Values between 100 and 101 must not draw as a flat line just because they
    // are near each other in absolute terms.
    const points = sparklinePoints([100, 100.5, 101], 88, 24)
    expect(points[0].y).not.toBe(points[2].y)
  })

  it('stays inside its box', () => {
    for (const point of sparklinePoints([5, 200, 60, 90], 88, 24)) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(88)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(24)
    }
  })

  it('draws nothing from a single reading, which has no shape', () => {
    expect(sparklinePoints([5], 88, 24)).toEqual([])
    expect(sparklinePoints([], 88, 24)).toEqual([])
  })

  it('ignores gaps rather than plotting them at zero', () => {
    expect(sparklinePoints([10, NaN, 30], 88, 24)).toHaveLength(2)
  })
})
