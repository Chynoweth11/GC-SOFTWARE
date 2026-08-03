import { describe, expect, it } from 'vitest'
import { canOpenReport, REPORT_REQUIRES, REPORT_TITLES } from '@/lib/queries/report-spec'
import type { Role } from '@/generated/prisma'

/**
 * The page, the report card and both exports read one map. These tests pin the
 * consequence: a role that cannot export a report cannot open it either.
 */

const ROLES: Role[] = [
  'OWNER', 'ADMIN', 'EXECUTIVE', 'PROJECT_MANAGER', 'PROJECT_ENGINEER',
  'ESTIMATOR', 'ACCOUNTING', 'FINANCE', 'READ_ONLY',
]

describe('report permissions', () => {
  it('names a requirement only for reports that actually exist', () => {
    for (const slug of Object.keys(REPORT_REQUIRES)) expect(REPORT_TITLES[slug]).toBeDefined()
  })

  it('keeps company profit and margins away from a read-only user', () => {
    expect(canOpenReport('READ_ONLY', 'profitability')).toBe(false)
    expect(canOpenReport('READ_ONLY', 'wip')).toBe(false)
    expect(canOpenReport('READ_ONLY', 'billing-position')).toBe(false)
    expect(canOpenReport('READ_ONLY', 'cashflow')).toBe(false)
  })

  it('keeps the cash position away from a project manager and an estimator', () => {
    expect(canOpenReport('PROJECT_MANAGER', 'cashflow')).toBe(false)
    expect(canOpenReport('ESTIMATOR', 'cashflow')).toBe(false)
  })

  it('lets accounting see the cash position but not margins', () => {
    expect(canOpenReport('ACCOUNTING', 'cashflow')).toBe(true)
    expect(canOpenReport('ACCOUNTING', 'wip')).toBe(true)
    expect(canOpenReport('ACCOUNTING', 'profitability')).toBe(false)
  })

  it('lets an owner, an executive and finance open everything', () => {
    for (const role of ['OWNER', 'ADMIN', 'EXECUTIVE', 'FINANCE'] as Role[]) {
      for (const slug of Object.keys(REPORT_TITLES)) expect(canOpenReport(role, slug)).toBe(true)
    }
  })

  it('leaves unrestricted reports open to every role', () => {
    for (const role of ROLES) {
      for (const slug of ['budget-vs-actual', 'committed', 'eac', 'backlog', 'subcontractors', 'change-orders', 'buyout', 'bid-summary', 'pipeline']) {
        expect(canOpenReport(role, slug)).toBe(true)
      }
    }
  })
})
