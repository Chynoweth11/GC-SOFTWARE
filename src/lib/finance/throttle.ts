/**
 * How long a run of failed sign-ins should be made to wait.
 *
 * Kept here, next to the other engines, for the same reason they are: it is a
 * rule with an answer that can be checked, and a rule about who gets into a
 * system holding a company's contract values deserves a test more than most.
 *
 * The shape is deliberate. A person who mistypes a password twice notices
 * nothing. A person who has genuinely forgotten it waits a few seconds, then a
 * minute, and is told plainly how long. Somebody working through a list finds
 * that the waits compound faster than the guesses do.
 *
 * Two counters, not one. By email, so an attack on one account cannot be spread
 * across many addresses to stay under the limit. By address, so an attack
 * spread across many addresses is still stopped. Either one tripping is enough.
 */

/** A failed attempt, as far as this rule cares. */
export interface AttemptRecord {
  createdAt: Date
  successful: boolean
}

export interface ThrottleRules {
  /** Failures inside the window before the wait starts. */
  freeAttempts: number
  /** How far back failures are counted, in minutes. */
  windowMinutes: number
  /** The first wait, in seconds. Each further failure doubles it. */
  firstWaitSeconds: number
  /** However many failures pile up, the wait stops growing here. */
  maxWaitSeconds: number
}

export const EMAIL_RULES: ThrottleRules = {
  freeAttempts: 5,
  windowMinutes: 15,
  firstWaitSeconds: 15,
  maxWaitSeconds: 900,
}

/**
 * An address is given more room than an email, because a whole office behind
 * one address will legitimately produce more failures in a morning than one
 * person will.
 */
export const ADDRESS_RULES: ThrottleRules = {
  freeAttempts: 20,
  windowMinutes: 15,
  firstWaitSeconds: 5,
  maxWaitSeconds: 900,
}

export interface ThrottleVerdict {
  /** Whether this attempt may proceed to the password check at all. */
  allowed: boolean
  /** Seconds still to wait. Zero when allowed. */
  waitSeconds: number
  /** Failures counted inside the window. */
  recentFailures: number
  /** How many more failures before the next wait, once allowed again. */
  remainingBeforeWait: number
}

/**
 * Whether an attempt may proceed, given what came before it.
 *
 * A success clears the slate: only failures since the last successful sign-in
 * are counted, so somebody who gets it wrong four times and then right is not
 * carrying those four into next week.
 */
export function throttleVerdict(
  attempts: readonly AttemptRecord[],
  rules: ThrottleRules,
  now: Date,
): ThrottleVerdict {
  const windowStart = new Date(now.getTime() - rules.windowMinutes * 60_000)

  // Newest first, stopping at the last success or the edge of the window.
  const ordered = [...attempts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const failures: AttemptRecord[] = []
  for (const attempt of ordered) {
    if (attempt.createdAt < windowStart) break
    if (attempt.successful) break
    failures.push(attempt)
  }

  const count = failures.length
  if (count < rules.freeAttempts) {
    return {
      allowed: true,
      waitSeconds: 0,
      recentFailures: count,
      remainingBeforeWait: rules.freeAttempts - count,
    }
  }

  // The first failure past the free ones waits `firstWaitSeconds`, and every
  // one after that doubles it, up to the cap.
  const over = count - rules.freeAttempts
  const wait = Math.min(rules.firstWaitSeconds * 2 ** over, rules.maxWaitSeconds)

  const last = failures[0]
  const readyAt = new Date(last.createdAt.getTime() + wait * 1000)
  const remaining = Math.ceil((readyAt.getTime() - now.getTime()) / 1000)

  if (remaining <= 0) {
    return { allowed: true, waitSeconds: 0, recentFailures: count, remainingBeforeWait: 1 }
  }
  return { allowed: false, waitSeconds: remaining, recentFailures: count, remainingBeforeWait: 0 }
}

/** How long to wait, said the way a person would say it. */
export function waitInWords(seconds: number): string {
  if (seconds <= 1) return 'a moment'
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}
