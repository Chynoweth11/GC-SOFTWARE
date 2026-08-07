import { describe, expect, it } from 'vitest'
import {
  buildComplianceAlerts,
  deadlinesThrough,
  deriveCompliance,
  nextDeadline,
  summarizeCompliance,
  type ComplianceRequirementInput,
  type ComplianceSubmissionInput,
} from './compliance'

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const requirement = (over: Partial<ComplianceRequirementInput> = {}): ComplianceRequirementInput => ({
  id: 'r1',
  kind: 'CERTIFIED_PAYROLL',
  title: 'Certified payroll',
  agency: 'Labor and Industries',
  frequency: 'WEEKLY',
  firstDueDate: D('2026-03-06'),
  endsOn: null,
  leadDays: 7,
  responsibleName: 'Dana',
  active: true,
  ...over,
})

const filed = (dueDate: string, submittedAt = dueDate): ComplianceSubmissionInput => ({
  id: `s-${dueDate}`,
  dueDate: D(dueDate),
  periodEnd: null,
  submittedAt: D(submittedAt),
  submittedByName: 'Dana',
  reference: 'WH-347',
})

describe('nextDeadline', () => {
  it('steps a week, a fortnight, a month, a quarter and a year', () => {
    expect(nextDeadline(D('2026-03-06'), 'WEEKLY')).toEqual(D('2026-03-13'))
    expect(nextDeadline(D('2026-03-06'), 'BIWEEKLY')).toEqual(D('2026-03-20'))
    expect(nextDeadline(D('2026-03-06'), 'MONTHLY')).toEqual(D('2026-04-06'))
    expect(nextDeadline(D('2026-03-06'), 'QUARTERLY')).toEqual(D('2026-06-06'))
    expect(nextDeadline(D('2026-03-06'), 'ANNUAL')).toEqual(D('2027-03-06'))
  })

  it('steps twice a month between the fifteenth and the month end', () => {
    expect(nextDeadline(D('2026-03-01'), 'SEMIMONTHLY')).toEqual(D('2026-03-15'))
    expect(nextDeadline(D('2026-03-15'), 'SEMIMONTHLY')).toEqual(D('2026-04-15'))
    expect(nextDeadline(D('2026-03-31'), 'SEMIMONTHLY')).toEqual(D('2026-04-15'))
  })

  it('has no next deadline for something filed once', () => {
    expect(nextDeadline(D('2026-03-06'), 'ONE_TIME')).toBeNull()
  })
})

describe('deadlinesThrough', () => {
  it('counts forward from the first deadline to the horizon', () => {
    const deadlines = deadlinesThrough(
      { frequency: 'WEEKLY', firstDueDate: D('2026-03-06'), endsOn: null },
      D('2026-04-03'),
    )
    expect(deadlines).toEqual([D('2026-03-06'), D('2026-03-13'), D('2026-03-20'), D('2026-03-27'), D('2026-04-03')])
  })

  it('stops at the end date on the requirement', () => {
    const deadlines = deadlinesThrough(
      { frequency: 'WEEKLY', firstDueDate: D('2026-03-06'), endsOn: D('2026-03-20') },
      D('2026-12-31'),
    )
    expect(deadlines).toHaveLength(3)
  })

  it('is bounded, so a weekly filing on a long job cannot run away', () => {
    const deadlines = deadlinesThrough(
      { frequency: 'WEEKLY', firstDueDate: D('2000-01-07'), endsOn: null },
      D('2100-01-01'),
      52,
    )
    expect(deadlines).toHaveLength(52)
  })
})

describe('deriveCompliance', () => {
  it('is current when everything due so far has been filed and the next one is outside the lead time', () => {
    const row = deriveCompliance(
      requirement({ leadDays: 2 }),
      [filed('2026-03-06'), filed('2026-03-13')],
      D('2026-03-16'),
    )

    expect(row.status).toBe('CURRENT')
    expect(row.nextDueDate).toEqual(D('2026-03-20'))
    expect(row.daysUntilDue).toBe(4)
    expect(row.missedDueDates).toHaveLength(0)
    expect(row.submissionCount).toBe(2)
  })

  it('warns inside the lead time', () => {
    const row = deriveCompliance(
      requirement({ leadDays: 3 }),
      [filed('2026-03-06'), filed('2026-03-13')],
      D('2026-03-18'),
    )
    expect(row.status).toBe('DUE_SOON')
    expect(row.summary).toContain('Due in 2 days')
    expect(row.summary).toContain('Dana')
  })

  it('calls out the day itself', () => {
    const row = deriveCompliance(requirement(), [filed('2026-03-06')], D('2026-03-13'))
    expect(row.status).toBe('DUE_TODAY')
  })

  it('goes overdue when a deadline passes unanswered', () => {
    const row = deriveCompliance(requirement(), [filed('2026-03-06')], D('2026-03-20'))

    expect(row.status).toBe('OVERDUE')
    expect(row.nextDueDate).toEqual(D('2026-03-13'))
    expect(row.daysUntilDue).toBe(-7)
    expect(row.summary).toContain('Overdue by 7 days')
  })

  /**
   * The behaviour a stored "last submitted" date would have got wrong, and the
   * reason nothing about the schedule is stored.
   */
  it('points at the oldest gap, not at next week, when filings were missed in the middle', () => {
    // Three weekly deadlines missed in the middle, then the latest one filed.
    const row = deriveCompliance(
      requirement(),
      [filed('2026-03-06'), filed('2026-04-10')],
      D('2026-04-13'),
    )

    expect(row.nextDueDate).toEqual(D('2026-03-13'))
    expect(row.status).toBe('OVERDUE')
    expect(row.missedDueDates).toEqual([D('2026-03-13'), D('2026-03-20'), D('2026-03-27'), D('2026-04-03')])
    expect(row.summary).toContain('4 deadlines have gone unanswered')
  })

  it('does not shift the schedule because a filing was made late', () => {
    // Filed four days after it was due; the following week is still due when it
    // always was.
    const row = deriveCompliance(requirement(), [filed('2026-03-06', '2026-03-10')], D('2026-03-11'))
    expect(row.nextDueDate).toEqual(D('2026-03-13'))
    expect(row.lastSubmittedAt).toEqual(D('2026-03-10'))
  })

  it('closes once a one-time filing is made', () => {
    const row = deriveCompliance(
      requirement({ frequency: 'ONE_TIME', title: 'Statement of intent to pay prevailing wages' }),
      [filed('2026-03-06')],
      D('2026-06-01'),
    )
    expect(row.status).toBe('CLOSED')
    expect(row.nextDueDate).toBeNull()
    expect(row.summary).toContain('Every filing has been made')
  })

  it('closes when the requirement is retired, whatever is outstanding', () => {
    const row = deriveCompliance(requirement({ active: false }), [], D('2026-06-01'))
    expect(row.status).toBe('CLOSED')
    expect(row.summary).toContain('No longer required')
  })

  it('is overdue from the first deadline when nothing has ever been filed', () => {
    const row = deriveCompliance(requirement(), [], D('2026-03-20'))
    expect(row.nextDueDate).toEqual(D('2026-03-06'))
    expect(row.status).toBe('OVERDUE')
    expect(row.lastSubmittedAt).toBeNull()
  })
})

describe('summarizeCompliance', () => {
  const asOf = D('2026-04-13')

  const rows = [
    deriveCompliance(requirement(), [filed('2026-03-06'), filed('2026-04-10')], asOf),
    deriveCompliance(
      requirement({ id: 'r2', title: 'Apprenticeship utilisation', frequency: 'MONTHLY', firstDueDate: D('2026-03-31') }),
      [filed('2026-03-31')],
      asOf,
    ),
  ]

  it('counts what is overdue and what is coming', () => {
    const summary = summarizeCompliance(rows)
    expect(summary.overdue).toBe(1)
    expect(summary.headline).toBe('1 filing is overdue.')
  })

  it('states an on-time rate out of deadlines that actually fell', () => {
    const summary = summarizeCompliance(rows)
    // Certified payroll: 6 deadlines to 13 April, 4 missed. Apprenticeship: 1, 0 missed.
    expect(summary.onTimeRate).toBeCloseTo(3 / 7, 6)
  })

  it('says everything is up to date rather than showing a bare zero', () => {
    const clean = summarizeCompliance([
      deriveCompliance(requirement({ frequency: 'ONE_TIME' }), [filed('2026-03-06')], asOf),
    ])
    expect(clean.headline).toBe('Every filing is up to date.')
    expect(clean.onTimeRate).toBe(1)
  })

  it('says plainly when there is nothing recorded at all', () => {
    expect(summarizeCompliance([]).headline).toContain('No compliance requirements recorded')
  })
})

describe('buildComplianceAlerts', () => {
  const ctx = { projectId: 'p1', projectNumber: '26-001', projectName: 'Riverside' }

  it('raises an overdue filing as critical and names who owes it', () => {
    const rows = [deriveCompliance(requirement(), [], D('2026-03-20'))]
    const alerts = buildComplianceAlerts(rows, ctx)

    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('CRITICAL')
    expect(alerts[0].title).toContain('overdue')
    expect(alerts[0].action).toContain('Dana')
    expect(alerts[0].href).toBe('/projects/p1/labor')
    expect(alerts[0].detail).toContain('Nothing has been filed')
  })

  it('raises an upcoming filing as a warning', () => {
    const rows = [deriveCompliance(requirement({ leadDays: 5 }), [filed('2026-03-06')], D('2026-03-10'))]
    const alerts = buildComplianceAlerts(rows, ctx)
    expect(alerts[0].severity).toBe('WARNING')
    expect(alerts[0].title).toContain('due in 3 days')
  })

  it('stays quiet about anything current, closed or retired', () => {
    const rows = [
      deriveCompliance(requirement({ leadDays: 2 }), [filed('2026-03-06'), filed('2026-03-13')], D('2026-03-14')),
      deriveCompliance(requirement({ id: 'r2', active: false }), [], D('2026-06-01')),
    ]
    expect(buildComplianceAlerts(rows, ctx)).toHaveLength(0)
  })

  it('says nobody is responsible rather than leaving the sentence half written', () => {
    const rows = [deriveCompliance(requirement({ responsibleName: null }), [], D('2026-03-20'))]
    expect(buildComplianceAlerts(rows, ctx)[0].action).toContain('Nobody is named as responsible')
  })
})
