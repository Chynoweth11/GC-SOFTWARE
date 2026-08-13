import { describe, expect, it } from 'vitest'
import { buildComplianceDigest, type DigestRow } from './digest'

const row = (over: Partial<DigestRow> = {}): DigestRow => ({
  projectNumber: '26-001',
  projectName: 'Cascade Ridge',
  title: 'Certified payroll',
  agency: 'L&I',
  status: 'CURRENT',
  nextDueDate: new Date('2026-08-14'),
  daysUntilDue: 5,
  missedCount: 0,
  ...over,
})

describe('compliance digest: when it is sent at all', () => {
  it('is not sent when nothing is overdue or due soon', () => {
    const digest = buildComplianceDigest([row(), row({ status: 'CLOSED' })])
    expect(digest.worthSending).toBe(false)
  })

  it('is not sent for an empty list', () => {
    expect(buildComplianceDigest([]).worthSending).toBe(false)
  })

  it('is sent when something is overdue', () => {
    expect(buildComplianceDigest([row({ status: 'OVERDUE', daysUntilDue: -3 })]).worthSending).toBe(true)
  })

  it('is sent when something is due today', () => {
    expect(buildComplianceDigest([row({ status: 'DUE_TODAY', daysUntilDue: 0 })]).worthSending).toBe(true)
  })
})

describe('compliance digest: what it leads with', () => {
  it('puts the oldest overdue filing first, not the newest', () => {
    const digest = buildComplianceDigest([
      row({ status: 'OVERDUE', daysUntilDue: -2, title: 'Recent' }),
      row({ status: 'OVERDUE', daysUntilDue: -21, title: 'Three weeks' }),
      row({ status: 'OVERDUE', daysUntilDue: -9, title: 'Nine days' }),
    ])
    expect(digest.overdue.map((entry) => entry.title)).toEqual(['Three weeks', 'Nine days', 'Recent'])
  })

  it('keeps overdue and due soon apart', () => {
    const digest = buildComplianceDigest([
      row({ status: 'OVERDUE', daysUntilDue: -1 }),
      row({ status: 'DUE_SOON', daysUntilDue: 2 }),
    ])
    expect(digest.overdue).toHaveLength(1)
    expect(digest.dueSoon).toHaveLength(1)
  })

  it('says how many are overdue in the subject, because that is all most people read', () => {
    expect(buildComplianceDigest([row({ status: 'OVERDUE', daysUntilDue: -1 })]).subject).toBe(
      '1 filing is overdue',
    )
    expect(
      buildComplianceDigest([
        row({ status: 'OVERDUE', daysUntilDue: -1 }),
        row({ status: 'OVERDUE', daysUntilDue: -2 }),
      ]).subject,
    ).toBe('2 filings are overdue')
  })

  it('falls back to what is due soon when nothing is late', () => {
    expect(buildComplianceDigest([row({ status: 'DUE_SOON', daysUntilDue: 3 })]).subject).toBe(
      '1 filing is due soon',
    )
  })
})

describe('compliance digest: what each line says', () => {
  it('names the job, the filing, who it goes to and how late it is', () => {
    const digest = buildComplianceDigest([row({ status: 'OVERDUE', daysUntilDue: -14 })])
    expect(digest.text).toContain('26-001 Cascade Ridge')
    expect(digest.text).toContain('Certified payroll')
    expect(digest.text).toContain('to L&I')
    expect(digest.text).toContain('14 days late')
  })

  it('says how many deadlines went unanswered when it is more than one', () => {
    const digest = buildComplianceDigest([row({ status: 'OVERDUE', daysUntilDue: -21, missedCount: 3 })])
    expect(digest.text).toContain('3 deadlines unanswered')
  })

  it('escapes the html so a job name with an ampersand cannot break the message', () => {
    const digest = buildComplianceDigest([
      row({ status: 'OVERDUE', daysUntilDue: -1, projectName: 'Smith & Sons <Phase 2>' }),
    ])
    expect(digest.html).toContain('Smith &amp; Sons &lt;Phase 2&gt;')
    expect(digest.html).not.toContain('<Phase 2>')
  })

  it('carries a link back when it is given one', () => {
    const digest = buildComplianceDigest([row({ status: 'OVERDUE', daysUntilDue: -1 })], 'https://cx.example.com')
    expect(digest.text).toContain('https://cx.example.com')
    expect(digest.html).toContain('https://cx.example.com')
  })
})
