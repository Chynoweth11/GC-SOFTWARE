/** Month-boundary helpers. All periods in the system are keyed to month end (UTC). */

export function endOfMonth(date: Date, monthOffset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset + 1, 0, 0, 0, 0, 0))
}

export function startOfMonth(date: Date, monthOffset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0))
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

/** Inclusive list of month-end dates spanning `from`..`to`. */
export function monthEndsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = []
  let cursor = endOfMonth(from)
  const last = endOfMonth(to)
  let guard = 0
  while (cursor.getTime() <= last.getTime() && guard < 600) {
    out.push(cursor)
    cursor = endOfMonth(cursor, 1)
    guard++
  }
  return out
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function parseMonthKey(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0))
}

/**
 * Today, at midnight UTC.
 *
 * Financial figures are stated as at the project data date, which is when the
 * books were closed. Some questions are not about the books at all: whether a
 * bid is due next week, whether a follow-up has gone past due, whether a
 * certificate of insurance has expired. Those are about today.
 *
 * Every one of those reads this, so no two pages can answer the same question
 * differently. They previously did: the pipeline page and the pipeline report
 * each carried their own date, and the vendor list carried a third.
 */
export function today(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
