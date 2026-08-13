import { describe, expect, it } from 'vitest'
import { ADDRESS_RULES, EMAIL_RULES, throttleVerdict, waitInWords, type AttemptRecord } from './throttle'

const now = new Date('2026-08-09T12:00:00Z')

/** `count` failures, the most recent `secondsAgo` before now, a second apart. */
function failures(count: number, secondsAgo = 1): AttemptRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: new Date(now.getTime() - (secondsAgo + index) * 1000),
    successful: false,
  }))
}

describe('sign-in throttle: the free attempts', () => {
  it('lets somebody who mistypes their password notice nothing', () => {
    for (let count = 0; count < EMAIL_RULES.freeAttempts; count++) {
      const verdict = throttleVerdict(failures(count), EMAIL_RULES, now)
      expect(verdict.allowed).toBe(true)
      expect(verdict.waitSeconds).toBe(0)
    }
  })

  it('counts down how many are left', () => {
    expect(throttleVerdict(failures(3), EMAIL_RULES, now).remainingBeforeWait).toBe(2)
  })
})

describe('sign-in throttle: the wait', () => {
  it('starts once the free attempts are used up', () => {
    const verdict = throttleVerdict(failures(5), EMAIL_RULES, now)
    expect(verdict.allowed).toBe(false)
    expect(verdict.waitSeconds).toBe(EMAIL_RULES.firstWaitSeconds - 1)
  })

  it('doubles with each further failure', () => {
    // The most recent failure is one second old in each case, so the remaining
    // wait is the full wait less that second.
    expect(throttleVerdict(failures(6), EMAIL_RULES, now).waitSeconds).toBe(29)
    expect(throttleVerdict(failures(7), EMAIL_RULES, now).waitSeconds).toBe(59)
    expect(throttleVerdict(failures(8), EMAIL_RULES, now).waitSeconds).toBe(119)
  })

  it('stops growing at the cap, so an account is never locked for good', () => {
    const verdict = throttleVerdict(failures(40), EMAIL_RULES, now)
    expect(verdict.waitSeconds).toBe(EMAIL_RULES.maxWaitSeconds - 1)
  })

  it('lets the attempt through once the wait has passed', () => {
    const stale = failures(6, EMAIL_RULES.firstWaitSeconds * 2 + 5)
    expect(throttleVerdict(stale, EMAIL_RULES, now).allowed).toBe(true)
  })
})

describe('sign-in throttle: what clears it', () => {
  it('a successful sign-in wipes the failures before it', () => {
    const history: AttemptRecord[] = [
      ...failures(9, 10),
      { createdAt: new Date(now.getTime() - 5_000), successful: true },
    ]
    const verdict = throttleVerdict(history, EMAIL_RULES, now)
    expect(verdict.allowed).toBe(true)
    expect(verdict.recentFailures).toBe(0)
  })

  it('failures older than the window are not counted', () => {
    const old = failures(20, EMAIL_RULES.windowMinutes * 60 + 60)
    expect(throttleVerdict(old, EMAIL_RULES, now).recentFailures).toBe(0)
  })

  it('a failure inside the window still counts even with older ones outside it', () => {
    const history = [...failures(1, 5), ...failures(20, EMAIL_RULES.windowMinutes * 60 + 60)]
    expect(throttleVerdict(history, EMAIL_RULES, now).recentFailures).toBe(1)
  })
})

describe('sign-in throttle: an address is given more room than an email', () => {
  it('because a whole office shares one', () => {
    expect(ADDRESS_RULES.freeAttempts).toBeGreaterThan(EMAIL_RULES.freeAttempts)
    expect(throttleVerdict(failures(10), ADDRESS_RULES, now).allowed).toBe(true)
    expect(throttleVerdict(failures(10), EMAIL_RULES, now).allowed).toBe(false)
  })

  it('but is still stopped eventually', () => {
    expect(throttleVerdict(failures(25), ADDRESS_RULES, now).allowed).toBe(false)
  })
})

describe('sign-in throttle: how the wait is said', () => {
  it('reads the way a person would say it', () => {
    expect(waitInWords(1)).toBe('a moment')
    expect(waitInWords(29)).toBe('29 seconds')
    expect(waitInWords(60)).toBe('a minute')
    expect(waitInWords(150)).toBe('3 minutes')
  })
})
