/**
 * The arithmetic behind every chart, kept out of the components that draw them.
 *
 * This was the last place in the system where a real calculation had no test.
 * The financial engines are all pure and checked; the chart geometry was forty
 * lines of trigonometry and scaling living inside JSX, where a mistake produces
 * a picture that is visibly wrong from data that is perfectly right. Nothing
 * would have caught it: the page renders, the console is clean, the figure
 * beside the chart is correct, and only the shape lies.
 *
 * So it lives here, as functions that take numbers and return numbers, and it
 * is tested the way the money is tested.
 *
 * Nothing here rounds a value on the way in. Rounding happens once, at the very
 * end, on the coordinate that goes into the markup, and only to the hundredth
 * of a pixel so the server and the browser produce byte-identical output.
 */

/** Rounds a coordinate so server and client markup always match exactly. */
export function coord(value: number): number {
  return Math.round(value * 100) / 100
}

// ── Axis ticks ─────────────────────────────────────────────────────────────

/**
 * Round numbers that bracket the data, at a spacing a person would choose.
 *
 * A tick every 3,721 is technically evenly spaced and useless to read. The step
 * is snapped to 1, 2, 5 or 10 times a power of ten, which is what somebody
 * drawing the axis by hand would pick, and the first tick is dropped to the
 * round number at or below the smallest value so the data always sits inside
 * the axis rather than starting off the end of it.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0]
  if (min === max) return [min]
  if (min > max) [min, max] = [max, min]

  const rawStep = (max - min) / Math.max(1, count)
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1))
  const normalized = rawStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude

  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  // A generous but finite bound: a step that somehow came out tiny must not
  // spin here, and no axis a person reads has more than a few dozen ticks.
  for (let value = start, guard = 0; value <= max + step * 0.001 && guard < 1_000; value += step, guard++) {
    // Floating point leaves -0 and 1e-16 lying around when stepping through
    // zero, and an axis labelled "-0" is a bug somebody will report.
    ticks.push(Math.abs(value) < step * 1e-9 ? 0 : value)
  }
  return ticks
}

/**
 * The span an axis covers, given the series on it.
 *
 * Zero is included by default because a bar chart that does not start at zero
 * exaggerates every difference on it, which is the oldest way to mislead with a
 * chart. A line chart tracking a rate can opt out, because forcing a
 * productivity curve that lives between 0.9 and 1.1 down to zero flattens the
 * only thing it is there to show.
 */
export function extentOf(values: readonly (number | null | undefined)[], includeZero = true): { min: number; max: number } {
  const clean = values.filter((value): value is number => value != null && isFinite(value))
  if (clean.length === 0) return { min: 0, max: 1 }

  let min = Math.min(...clean)
  let max = Math.max(...clean)
  if (includeZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  // A flat series has no span to scale against, so give it one rather than
  // dividing by zero and drawing every point on the same line.
  if (min === max) {
    if (min === 0) return { min: 0, max: 1 }
    return min > 0 ? { min: 0, max: min * 2 } : { min: min * 2, max: 0 }
  }
  return { min, max }
}

/** Where a value sits in a range, as a fraction. Outside the range is clamped. */
export function fractionOf(value: number, min: number, max: number): number {
  if (!isFinite(value) || max === min) return 0
  const fraction = (value - min) / (max - min)
  return Math.max(0, Math.min(1, fraction))
}

// ── Bars ───────────────────────────────────────────────────────────────────

/**
 * How wide each bar is drawn, as a percentage of the track.
 *
 * Measured against the largest absolute value across every series, so two
 * series on one row stay comparable with each other. Absolute, because a
 * negative variance is as large a fact as a positive one and a bar that
 * vanished when a figure went below zero would hide the worst rows.
 */
export function barWidths(values: readonly number[], scaleMax?: number): number[] {
  const clean = values.map((value) => (isFinite(value) ? value : 0))
  const max = scaleMax ?? Math.max(...clean.map(Math.abs), 0)
  if (max <= 0) return clean.map(() => 0)
  return clean.map((value) => (Math.abs(value) / max) * 100)
}

// ── Donut ──────────────────────────────────────────────────────────────────

export interface DonutArc {
  /** This slice's share of the whole, 0 to 1. */
  fraction: number
  /** Where the arc begins, in radians, measured from twelve o'clock. */
  startAngle: number
  endAngle: number
  /** Whether SVG needs the large-arc flag, which it does past half a turn. */
  largeArc: boolean
}

/**
 * A donut's slices, as angles.
 *
 * Absolute values, because a chart of "where the money went" with a credit in
 * it should show the credit's size rather than eating a neighbouring slice.
 * Angles start at twelve o'clock and run clockwise, which is how everybody
 * reads a pie, and each slice's start is derived from the running total rather
 * than accumulated in a variable, so a rounding error cannot creep along the
 * ring and leave a gap at the end.
 */
export function donutArcs(values: readonly number[]): DonutArc[] {
  const clean = values.map((value) => (isFinite(value) ? Math.abs(value) : 0))
  const total = clean.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []

  const TOP = -Math.PI / 2
  let before = 0

  return clean.map((value) => {
    const fraction = value / total
    const startAngle = TOP + before * Math.PI * 2
    before += fraction
    const endAngle = TOP + before * Math.PI * 2
    return { fraction, startAngle, endAngle, largeArc: fraction > 0.5 }
  })
}

/** A point on a circle, at a radius and an angle, about a centre. */
export function pointOnCircle(centre: number, radius: number, angle: number): { x: number; y: number } {
  return { x: coord(centre + radius * Math.cos(angle)), y: coord(centre + radius * Math.sin(angle)) }
}

/** The SVG path for one donut slice, from the outer arc round to the inner one. */
export function donutPath(arc: DonutArc, size: number, thickness: number): string {
  const radius = size / 2
  const inner = radius - thickness
  const large = arc.largeArc ? 1 : 0

  const outerStart = pointOnCircle(radius, radius, arc.startAngle)
  const outerEnd = pointOnCircle(radius, radius, arc.endAngle)
  const innerEnd = pointOnCircle(radius, inner, arc.endAngle)
  const innerStart = pointOnCircle(radius, inner, arc.startAngle)

  return (
    `M${outerStart.x},${outerStart.y} ` +
    `A${radius},${radius} 0 ${large} 1 ${outerEnd.x},${outerEnd.y} ` +
    `L${innerEnd.x},${innerEnd.y} ` +
    `A${inner},${inner} 0 ${large} 0 ${innerStart.x},${innerStart.y} Z`
  )
}

// ── Sparkline ──────────────────────────────────────────────────────────────

/**
 * A sparkline's points, scaled to its own range rather than to zero.
 *
 * A sparkline is about shape, not level: the figure it sits beside carries the
 * level. Scaling to the series' own minimum and maximum is what makes a
 * fortnight of small movements legible in eighty pixels.
 */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  padding = 2,
): { x: number; y: number }[] {
  const clean = values.filter((value) => isFinite(value))
  if (clean.length < 2) return []

  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const span = max - min || 1
  const usableWidth = Math.max(1, width - padding)
  const usableHeight = Math.max(1, height - padding * 2)

  return clean.map((value, index) => ({
    x: coord((index / (clean.length - 1)) * usableWidth + padding / 2),
    // Inverted, because an SVG's y grows downward and a chart's value grows up.
    y: coord(height - padding - ((value - min) / span) * usableHeight),
  }))
}
