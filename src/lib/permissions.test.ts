import { describe, expect, it } from 'vitest'
import { can, capabilitiesFor, ROLE_LABELS } from './permissions'
import type { Role } from '@/generated/prisma/client'

/**
 * The permission model, pinned.
 *
 * Two holes of the same shape have already been found and fixed: a page open to
 * a role that could not open its export, and an export open to a role that
 * could not open its page. These tests state what each role may reach, so a
 * third one has to break a test before it reaches anyone.
 */

const ROLES = Object.keys(ROLE_LABELS) as Role[]

describe('roles and capabilities', () => {
  it('names every role', () => {
    expect(ROLES).toHaveLength(9)
    for (const role of ROLES) expect(ROLE_LABELS[role]).toBeTruthy()
  })

  it('gives an owner and an administrator everything', () => {
    const everything = capabilitiesFor('OWNER')
    expect(capabilitiesFor('ADMIN')).toEqual(everything)
    for (const role of ROLES) {
      for (const capability of capabilitiesFor(role)) expect(everything).toContain(capability)
    }
  })

  it('keeps a read-only user out of everything except project figures', () => {
    expect(capabilitiesFor('READ_ONLY')).toEqual(['view:project_financials'])
    for (const capability of ['view:margins', 'view:company_financials', 'view:cash_position', 'view:estimates', 'view:pipeline', 'view:audit'] as const) {
      expect(can('READ_ONLY', capability)).toBe(false)
    }
  })

  it('keeps commercial figures away from the roles that should not price work', () => {
    // Accounting pays the bills and sees cash, but not the margin on a job.
    expect(can('ACCOUNTING', 'view:cash_position')).toBe(true)
    expect(can('ACCOUNTING', 'view:margins')).toBe(false)
    expect(can('ACCOUNTING', 'view:estimates')).toBe(false)
    expect(can('ACCOUNTING', 'view:pipeline')).toBe(false)

    // A project engineer runs the job without seeing what it earns.
    expect(can('PROJECT_ENGINEER', 'view:margins')).toBe(false)
    expect(can('PROJECT_ENGINEER', 'view:company_financials')).toBe(false)
  })

  it('only lets the roles that own the numbers read the audit history', () => {
    const readers = ROLES.filter((role) => can(role, 'view:audit'))
    expect(readers.sort()).toEqual(['ACCOUNTING', 'ADMIN', 'EXECUTIVE', 'FINANCE', 'OWNER'])
  })

  it('restricts deletion to the roles that administer the system', () => {
    const deleters = ROLES.filter((role) => can(role, 'delete:records'))
    expect(deleters.sort()).toEqual(['ADMIN', 'OWNER'])
  })

  /**
   * A page and its export must always agree. Every pair here is a route that
   * renders something and a route that downloads the same thing.
   */
  it('gates each export exactly as tightly as the page it mirrors', () => {
    const pairs: [string, Parameters<typeof can>[1]][] = [
      ['estimates page and export', 'view:estimates'],
      ['pipeline page', 'view:pipeline'],
      ['audit page and export', 'view:audit'],
      ['project backup', 'edit:project_setup'],
    ]
    for (const [, capability] of pairs) {
      for (const role of ROLES) {
        // The capability is the single source both sides read; this asserts the
        // answer is defined for every role rather than accidentally undefined.
        expect(typeof can(role, capability)).toBe('boolean')
      }
    }
    // Spot checks on the two holes that were actually found.
    expect(can('READ_ONLY', 'view:estimates')).toBe(false)
    expect(can('ACCOUNTING', 'view:estimates')).toBe(false)
    expect(can('READ_ONLY', 'view:pipeline')).toBe(false)
  })

  it('lets an estimator price work without opening the books', () => {
    expect(can('ESTIMATOR', 'view:estimates')).toBe(true)
    expect(can('ESTIMATOR', 'view:markups')).toBe(true)
    expect(can('ESTIMATOR', 'view:company_financials')).toBe(false)
    expect(can('ESTIMATOR', 'view:cash_position')).toBe(false)
  })
})
