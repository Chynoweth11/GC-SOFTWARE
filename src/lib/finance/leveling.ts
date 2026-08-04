import { num, safeDiv, sumBy } from './core'

export interface QuoteInput {
  id: string
  vendorId: string | null
  vendorName: string
  baseAmount: number
  adjustmentAmount: number
  inclusions: string | null
  exclusions: string | null
  qualifications: string | null
  allowances: number
  status: string
  notes: string | null
}

export interface PackageInput {
  id: string
  name: string
  tradeName: string | null
  divisionCode: string | null
  budgetAmount: number
  carriedAmount: number
  awardedVendorId: string | null
  awardAmount: number
  status: string
  notes: string | null
  quotes: QuoteInput[]
}

export interface LeveledQuote extends QuoteInput {
  leveledAmount: number
  isLow: boolean
  varianceToBudget: number
  varianceToLowPct: number
  /** Scopes present in other bidders' inclusions but absent from this one. */
  missingScopes: string[]
  flags: string[]
}

export interface LeveledPackage extends Omit<PackageInput, 'quotes'> {
  quotes: LeveledQuote[]
  lowLeveled: number
  spread: number
  spreadPct: number
  underOverBudget: number
  underOverBudgetPct: number
  buyoutSavings: number
  receivedCount: number
  flags: string[]
}

/** Splits an inclusions/exclusions blob into comparable scope tokens. */
function tokenize(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/[;,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2)
}

/**
 * Levels every quote in a package.
 *
 * Workbook source: Bid Leveling ▸ F,J,N,O,P,Q,T and Sub Quotes ▸ F,J,N,O,Q,S.
 *   Leveled       = Base + Adjustment   (only when a base was actually received)
 *   Low Leveled   = MIN of the non-zero leveled amounts
 *   Under/(Over)  = Budget − Low Leveled
 *   Buyout Saving = Budget − Award Amount
 *
 * The exception-highlighting the spreadsheet did with conditional formatting is
 * returned as explicit `flags` so the UI can explain each one.
 */
export function levelPackage(pkg: PackageInput, spreadThreshold = 0.15): LeveledPackage {
  const received = pkg.quotes.filter((q) => num(q.baseAmount) > 0)
  const leveledValues = received.map((q) => num(q.baseAmount) + num(q.adjustmentAmount))
  const lowLeveled = leveledValues.length ? Math.min(...leveledValues) : 0
  const highLeveled = leveledValues.length ? Math.max(...leveledValues) : 0

  // Scopes any bidder called out, used to spot gaps in the others.
  const allInclusions = new Set<string>()
  for (const q of received) for (const t of tokenize(q.inclusions)) allInclusions.add(t)

  const quotes: LeveledQuote[] = pkg.quotes.map((q) => {
    const hasBase = num(q.baseAmount) > 0
    const leveledAmount = hasBase ? num(q.baseAmount) + num(q.adjustmentAmount) : 0
    const own = new Set(tokenize(q.inclusions))
    const missingScopes = hasBase ? [...allInclusions].filter((t) => !own.has(t)) : []

    const flags: string[] = []
    if (q.status === 'PENDING') flags.push('Quote still pending')
    if (hasBase && !q.inclusions && !q.exclusions) flags.push('No scope letter: inclusions and exclusions blank')
    if (hasBase && num(q.allowances) > 0) flags.push('Carries an allowance')
    if (missingScopes.length > 0) flags.push(`${missingScopes.length} scope gap${missingScopes.length === 1 ? '' : 's'} vs. other bidders`)
    if (hasBase && num(pkg.budgetAmount) > 0 && leveledAmount > num(pkg.budgetAmount))
      flags.push('Over budget')
    if (hasBase && lowLeveled > 0 && leveledAmount > lowLeveled * (1 + spreadThreshold * 2))
      flags.push('Materially above the low bid')

    return {
      ...q,
      leveledAmount,
      isLow: hasBase && leveledAmount === lowLeveled && lowLeveled > 0,
      varianceToBudget: num(pkg.budgetAmount) - leveledAmount,
      varianceToLowPct: safeDiv(leveledAmount - lowLeveled, lowLeveled),
      missingScopes,
      flags,
    }
  })

  const spread = highLeveled - lowLeveled
  const flags: string[] = []
  if (received.length === 0) flags.push('No quotes received')
  else if (received.length === 1) flags.push('Only one bidder, no competitive check')
  if (received.length > 1 && safeDiv(spread, lowLeveled) > spreadThreshold)
    flags.push(`Wide spread: ${(safeDiv(spread, lowLeveled) * 100).toFixed(0)}% between high and low`)
  if (num(pkg.budgetAmount) > 0 && lowLeveled > num(pkg.budgetAmount))
    flags.push('Every bid is over budget')
  if (pkg.quotes.some((q) => q.status === 'PENDING')) flags.push('Awaiting outstanding quotes')

  // Duplicate scope: the same inclusion token claimed by two packages is caught at
  // the summary level; within a package we flag identical bidders instead.
  const names = received.map((q) => q.vendorName.trim().toLowerCase())
  if (new Set(names).size !== names.length) flags.push('Duplicate bidder in this package')

  return {
    ...pkg,
    quotes,
    lowLeveled,
    spread,
    spreadPct: safeDiv(spread, lowLeveled),
    underOverBudget: lowLeveled === 0 ? 0 : num(pkg.budgetAmount) - lowLeveled,
    underOverBudgetPct: safeDiv(num(pkg.budgetAmount) - lowLeveled, num(pkg.budgetAmount)),
    buyoutSavings: num(pkg.awardAmount) > 0 ? num(pkg.budgetAmount) - num(pkg.awardAmount) : 0,
    receivedCount: received.length,
    flags,
  }
}

export function levelAll(packages: readonly PackageInput[]): LeveledPackage[] {
  return packages.map((p) => levelPackage(p))
}

export function levelingSummary(packages: readonly LeveledPackage[]) {
  const awarded = packages.filter((p) => num(p.awardAmount) > 0)
  return {
    packageCount: packages.length,
    awardedCount: awarded.length,
    openCount: packages.length - awarded.length,
    totalBudget: sumBy(packages, (p) => p.budgetAmount),
    totalAwarded: sumBy(awarded, (p) => p.awardAmount),
    totalLow: sumBy(packages, (p) => p.lowLeveled),
    buyoutSavings: sumBy(awarded, (p) => p.buyoutSavings),
    buyoutSavingsPct: safeDiv(
      sumBy(awarded, (p) => p.buyoutSavings),
      sumBy(awarded, (p) => p.budgetAmount),
    ),
    packagesWithFlags: packages.filter((p) => p.flags.length > 0).length,
    quotesPending: sumBy(packages, (p) => p.quotes.filter((q) => q.status === 'PENDING').length),
  }
}
