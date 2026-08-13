/**
 * What a compliance reminder should say, and whether it is worth sending.
 *
 * Kept apart from the sending so it can be tested without a mail provider, and
 * so the same summary can go to an inbox, a dashboard panel or a log without
 * being written three times.
 *
 * The rule that matters is the last one: a digest with nothing overdue and
 * nothing due soon is not sent at all. A daily mail that usually says "nothing
 * to do" trains people to delete it unread, and then the one that matters gets
 * deleted with the rest.
 */

import type { ComplianceStatus } from './compliance'

export interface DigestRow {
  projectNumber: string
  projectName: string
  title: string
  agency: string | null
  status: ComplianceStatus
  nextDueDate: Date | null
  daysUntilDue: number | null
  missedCount: number
}

export interface Digest {
  /** Whether there is anything here worth an email. */
  worthSending: boolean
  subject: string
  text: string
  html: string
  overdue: DigestRow[]
  dueSoon: DigestRow[]
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`
}

function longDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** How a single line reads, in both the text and the HTML version. */
function line(row: DigestRow): string {
  const due = row.nextDueDate ? longDate(row.nextDueDate) : 'no date'
  const late =
    row.daysUntilDue !== null && row.daysUntilDue < 0
      ? `${plural(Math.abs(row.daysUntilDue), 'day', 'days')} late`
      : row.daysUntilDue === 0
        ? 'due today'
        : row.daysUntilDue !== null
          ? `in ${plural(row.daysUntilDue, 'day', 'days')}`
          : ''
  const missed = row.missedCount > 1 ? `, ${row.missedCount} deadlines unanswered` : ''
  return `${row.projectNumber} ${row.projectName}: ${row.title}${row.agency ? ` to ${row.agency}` : ''}, due ${due}, ${late}${missed}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Builds the digest from every requirement on every live job.
 *
 * Overdue first, because that is what somebody has to act on today, and inside
 * each group the oldest deadline leads: a filing missed three weeks ago is a
 * bigger problem than one missed yesterday, and burying it under a longer list
 * of things merely due soon is how it stays missed.
 */
export function buildComplianceDigest(rows: readonly DigestRow[], baseUrl?: string): Digest {
  const overdue = rows
    .filter((row) => row.status === 'OVERDUE')
    .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0))

  const dueSoon = rows
    .filter((row) => row.status === 'DUE_TODAY' || row.status === 'DUE_SOON')
    .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0))

  const worthSending = overdue.length > 0 || dueSoon.length > 0

  const subject = !worthSending
    ? 'Labor compliance: nothing outstanding'
    : overdue.length > 0
      ? `${plural(overdue.length, 'filing is', 'filings are')} overdue`
      : `${plural(dueSoon.length, 'filing is', 'filings are')} due soon`

  const parts: string[] = []
  if (overdue.length > 0) {
    parts.push('Overdue', ...overdue.map((row) => `  ${line(row)}`), '')
  }
  if (dueSoon.length > 0) {
    parts.push('Due soon', ...dueSoon.map((row) => `  ${line(row)}`), '')
  }
  if (baseUrl) parts.push(`Open the jobs: ${baseUrl}`)
  const text = parts.join('\n')

  const section = (heading: string, list: DigestRow[], color: string) =>
    list.length === 0
      ? ''
      : `<h2 style="font:600 13px/1.4 system-ui,sans-serif;color:${color};margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em">${heading}</h2>` +
        `<ul style="margin:0;padding:0 0 0 18px;font:400 14px/1.6 system-ui,sans-serif;color:#1a1a1a">` +
        list.map((row) => `<li>${escapeHtml(line(row))}</li>`).join('') +
        `</ul>`

  const html =
    `<div style="max-width:640px;margin:0 auto;padding:24px">` +
    `<p style="font:400 14px/1.6 system-ui,sans-serif;color:#555;margin:0">` +
    `Labor compliance across every live job.</p>` +
    section('Overdue', overdue, '#b42318') +
    section('Due soon', dueSoon, '#b54708') +
    (baseUrl
      ? `<p style="margin:24px 0 0"><a href="${escapeHtml(baseUrl)}" style="font:500 14px system-ui,sans-serif;color:#1a1a1a">Open ConstructX</a></p>`
      : '') +
    `</div>`

  return { worthSending, subject, text, html, overdue, dueSoon }
}
