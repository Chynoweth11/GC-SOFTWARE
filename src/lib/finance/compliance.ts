import { daysBetween, today } from './dates'
import type { Alert, AlertSeverity } from './types'

/**
 * Labor compliance deadlines, and whether they have been met.
 *
 * A job on public work owes a stream of filings: certified payroll most weeks,
 * an apprenticeship report most months, a wage determination checked each
 * quarter. Each of them is small, and each of them can stop a payment
 * application when it is late.
 *
 * Nothing about a deadline is stored. The whole schedule is counted forward
 * from the first due date at the stated frequency, and what has actually been
 * filed is matched against it. That has two consequences worth being explicit
 * about. A filing made late does not shift the schedule, so the next one is
 * still due when it was always due. And a gap in the middle stays visible as a
 * gap rather than being papered over by the most recent filing, which is what
 * a stored "last submitted" date would have done.
 */

export type ComplianceFrequency =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'SEMIMONTHLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL'
  | 'ONE_TIME'

export const FREQUENCY_LABELS: Record<ComplianceFrequency, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every two weeks',
  SEMIMONTHLY: 'Twice a month',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annually',
  ONE_TIME: 'Once',
}

export type ComplianceStatus = 'CURRENT' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'CLOSED'

export interface ComplianceRequirementInput {
  id: string
  kind: string
  title: string
  agency: string | null
  frequency: ComplianceFrequency
  firstDueDate: Date
  /** Where the obligation ends before the job does. */
  endsOn: Date | null
  /** How many days ahead of a deadline to start warning. */
  leadDays: number
  responsibleName: string | null
  active: boolean
}

export interface ComplianceSubmissionInput {
  id: string
  dueDate: Date
  periodEnd: Date | null
  submittedAt: Date
  submittedByName: string | null
  reference: string | null
}

/** Steps one deadline forward to the next, at the stated frequency. */
export function nextDeadline(from: Date, frequency: ComplianceFrequency): Date | null {
  const year = from.getUTCFullYear()
  const month = from.getUTCMonth()
  const day = from.getUTCDate()

  switch (frequency) {
    case 'WEEKLY':
      return new Date(from.getTime() + 7 * 86_400_000)
    case 'BIWEEKLY':
      return new Date(from.getTime() + 14 * 86_400_000)
    case 'SEMIMONTHLY':
      // The fifteenth and the end of the month, which is how these are almost
      // always written. Anything before the fifteenth steps to it; anything on
      // or after steps to the fifteenth of the following month.
      return day < 15
        ? new Date(Date.UTC(year, month, 15))
        : new Date(Date.UTC(year, month + 1, 15))
    case 'MONTHLY':
      return new Date(Date.UTC(year, month + 1, day))
    case 'QUARTERLY':
      return new Date(Date.UTC(year, month + 3, day))
    case 'ANNUAL':
      return new Date(Date.UTC(year + 1, month, day))
    case 'ONE_TIME':
      return null
    default:
      return null
  }
}

/**
 * Every deadline this requirement has had, up to a horizon.
 *
 * Bounded twice over: by the requirement's own end date where it has one, and
 * by a hard step limit, so a weekly filing on a job left open for years cannot
 * spin out a list nobody asked for.
 */
export function deadlinesThrough(
  requirement: Pick<ComplianceRequirementInput, 'frequency' | 'firstDueDate' | 'endsOn'>,
  horizon: Date,
  limit = 520,
): Date[] {
  const out: Date[] = []
  let cursor: Date | null = requirement.firstDueDate
  const end = requirement.endsOn

  while (cursor && out.length < limit) {
    if (cursor.getTime() > horizon.getTime()) break
    if (end && cursor.getTime() > end.getTime()) break
    out.push(cursor)
    cursor = nextDeadline(cursor, requirement.frequency)
  }
  return out
}

export interface ComplianceDerived {
  requirement: ComplianceRequirementInput
  /** The next deadline not yet answered by a filing. Null when finished. */
  nextDueDate: Date | null
  /** Negative means the deadline has passed. */
  daysUntilDue: number | null
  status: ComplianceStatus
  /** Deadlines that came and went with nothing filed against them. */
  missedDueDates: Date[]
  lastSubmittedAt: Date | null
  lastSubmittedByName: string | null
  submissionCount: number
  /** Deadlines to date, so a completion rate can be stated honestly. */
  deadlinesToDate: number
  /** What to say about it, in one line. */
  summary: string
}

/**
 * Works out where a requirement stands as of a given day.
 *
 * The next due date is the earliest deadline nothing has been filed against.
 * That is deliberately not "the last filing plus one period": if three weekly
 * payrolls were missed in June, the next thing due is the first of those three,
 * not next Friday, and this says so.
 */
export function deriveCompliance(
  requirement: ComplianceRequirementInput,
  submissions: readonly ComplianceSubmissionInput[],
  asOf: Date = today(),
): ComplianceDerived {
  const answered = new Set(submissions.map((submission) => submission.dueDate.getTime()))
  const sorted = [...submissions].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
  const last = sorted[0] ?? null

  // Look one period past today so a deadline coming up is found, not just the
  // ones already passed.
  const horizon = new Date(asOf.getTime() + 400 * 86_400_000)
  const deadlines = deadlinesThrough(requirement, horizon)

  const past = deadlines.filter((deadline) => deadline.getTime() <= asOf.getTime())
  const missedDueDates = past.filter((deadline) => !answered.has(deadline.getTime()))
  const outstanding = deadlines.filter((deadline) => !answered.has(deadline.getTime()))
  const nextDueDate = outstanding[0] ?? null

  const daysUntilDue = nextDueDate ? daysBetween(asOf, nextDueDate) : null

  let status: ComplianceStatus
  if (!requirement.active) status = 'CLOSED'
  else if (nextDueDate === null) status = 'CLOSED'
  else if (daysUntilDue! < 0) status = 'OVERDUE'
  else if (daysUntilDue === 0) status = 'DUE_TODAY'
  else if (daysUntilDue! <= Math.max(0, requirement.leadDays)) status = 'DUE_SOON'
  else status = 'CURRENT'

  const summary = describe(requirement, status, nextDueDate, daysUntilDue, missedDueDates.length)

  return {
    requirement,
    nextDueDate,
    daysUntilDue,
    status,
    missedDueDates,
    lastSubmittedAt: last?.submittedAt ?? null,
    lastSubmittedByName: last?.submittedByName ?? null,
    submissionCount: submissions.length,
    deadlinesToDate: past.length,
    summary,
  }
}

function describe(
  requirement: ComplianceRequirementInput,
  status: ComplianceStatus,
  nextDueDate: Date | null,
  daysUntilDue: number | null,
  missed: number,
): string {
  const who = requirement.responsibleName ? ` ${requirement.responsibleName} is responsible.` : ''

  switch (status) {
    case 'CLOSED':
      return requirement.active ? 'Every filing has been made.' : 'No longer required on this job.'
    case 'OVERDUE': {
      const days = Math.abs(daysUntilDue ?? 0)
      const behind = missed > 1 ? ` ${missed} deadlines have gone unanswered.` : ''
      return `Overdue by ${days} ${days === 1 ? 'day' : 'days'}.${behind}${who}`
    }
    case 'DUE_TODAY':
      return `Due today.${who}`
    case 'DUE_SOON':
      return `Due in ${daysUntilDue} ${daysUntilDue === 1 ? 'day' : 'days'}.${who}`
    default:
      return nextDueDate ? `Next due in ${daysUntilDue} days.` : 'Nothing outstanding.'
  }
}

export interface ComplianceSummary {
  rows: ComplianceDerived[]
  overdue: number
  dueSoon: number
  /** Deadlines answered, over deadlines that have fallen. */
  onTimeRate: number | null
  /** The single worst thing on the list, for a heading. */
  headline: string
}

export function summarizeCompliance(rows: readonly ComplianceDerived[]): ComplianceSummary {
  const live = rows.filter((row) => row.requirement.active)
  const overdue = live.filter((row) => row.status === 'OVERDUE').length
  const dueSoon = live.filter((row) => row.status === 'DUE_SOON' || row.status === 'DUE_TODAY').length

  const deadlines = live.reduce((total, row) => total + row.deadlinesToDate, 0)
  const missed = live.reduce((total, row) => total + row.missedDueDates.length, 0)

  let headline: string
  if (rows.length === 0) headline = 'No compliance requirements recorded on this job.'
  else if (overdue > 0) headline = `${overdue} ${overdue === 1 ? 'filing is' : 'filings are'} overdue.`
  else if (dueSoon > 0) headline = `${dueSoon} ${dueSoon === 1 ? 'filing is' : 'filings are'} due shortly.`
  else headline = 'Every filing is up to date.'

  return {
    rows: [...rows],
    overdue,
    dueSoon,
    onTimeRate: deadlines > 0 ? (deadlines - missed) / deadlines : null,
    headline,
  }
}

export interface ComplianceAlertContext {
  projectId: string
  projectNumber: string
  projectName: string
}

/**
 * Turns overdue and imminent filings into the same alerts as everything else.
 *
 * They belong in the project alert list rather than a corner of their own,
 * because a certified payroll three weeks late is as likely to stop a payment
 * as a budget overrun is, and the person who needs to see it is looking at the
 * project summary.
 */
export function buildComplianceAlerts(
  rows: readonly ComplianceDerived[],
  ctx: ComplianceAlertContext,
): Alert[] {
  const out: Alert[] = []
  const href = `/projects/${ctx.projectId}/labor`

  for (const row of rows) {
    if (!row.requirement.active) continue
    if (row.status !== 'OVERDUE' && row.status !== 'DUE_TODAY' && row.status !== 'DUE_SOON') continue

    const severity: AlertSeverity = row.status === 'OVERDUE' ? 'CRITICAL' : 'WARNING'
    const who = row.requirement.responsibleName ?? 'nobody in particular'

    out.push({
      id: `${ctx.projectId}:compliance:${row.requirement.id}`,
      severity,
      category: 'Compliance',
      title:
        row.status === 'OVERDUE'
          ? `${row.requirement.title} is overdue`
          : `${row.requirement.title} is due ${row.status === 'DUE_TODAY' ? 'today' : `in ${row.daysUntilDue} days`}`,
      detail: [
        row.summary,
        row.requirement.agency ? `Filed with ${row.requirement.agency}.` : null,
        row.lastSubmittedAt ? null : 'Nothing has been filed against this requirement yet.',
      ]
        .filter(Boolean)
        .join(' '),
      projectId: ctx.projectId,
      projectNumber: ctx.projectNumber,
      projectName: ctx.projectName,
      href,
      action: `File it and record the submission. ${who === 'nobody in particular' ? 'Nobody is named as responsible.' : `${who} is responsible.`}`,
      subjects: [row.requirement.title],
    })
  }

  return out
}
