/**
 * Numeric primitives shared by every financial calculation.
 *
 * Excel silently returns 0 for `IFERROR(x/0, 0)` in dozens of places across the
 * source workbooks; `safeDiv` is the single implementation of that behaviour so
 * a divide-by-zero can never leak `Infinity` or `NaN` into a report.
 */

export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return fallback
  const result = numerator / denominator
  return isFinite(result) ? result : fallback
}

export function sum(values: readonly number[]): number {
  let total = 0
  for (const v of values) total += num(v)
  return total
}

export function sumBy<T>(rows: readonly T[], pick: (row: T) => number | null | undefined): number {
  let total = 0
  for (const row of rows) total += num(pick(row))
  return total
}

/** Coerces null/undefined/NaN to 0 so partially filled records never poison a total. */
export function num(value: number | null | undefined): number {
  if (value == null) return 0
  return isFinite(value) ? value : 0
}

/** Rounds to `places` decimals using half-away-from-zero, matching Excel's ROUND. */
export function round(value: number, places = 2): number {
  if (!isFinite(value)) return 0
  const factor = 10 ** places
  return Math.sign(value) * Math.round(Math.abs(value) * factor) / factor
}

/** Currency rounding — the default for every dollar figure surfaced to a user. */
export function money(value: number): number {
  return round(value, 2)
}

/** Excel MROUND: rounds to the nearest multiple. Used for the final bid price. */
export function mround(value: number, multiple: number): number {
  if (multiple === 0) return value
  return Math.round(value / multiple) * multiple
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Fractions are stored 0–1 everywhere; this keeps percent-complete honest. */
export function clampPct(value: number): number {
  return clamp(num(value), 0, 1)
}

export function isZero(value: number, tolerance = 0.005): boolean {
  return Math.abs(value) <= tolerance
}
