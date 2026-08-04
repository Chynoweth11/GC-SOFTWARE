'use client'

import { useState } from 'react'
import type { LeveledPackage } from '@/lib/finance/leveling'
import { money, percent } from '@/lib/format'
import { Pill, StatusPill, Variance } from '@/components/ui'

/**
 * The bid-leveling board. Every quote is shown at its leveled value, with the
 * low bid marked and every exception the engine detected written out in words
 * rather than left as a colour.
 */
export function LevelingBoard({
  packages,
  canEdit,
  award,
  contextId,
  contextType,
}: {
  packages: LeveledPackage[]
  canEdit: boolean
  award?: (formData: FormData) => Promise<{ error?: string }>
  contextId: string
  contextType: 'project' | 'estimate'
}) {
  const [expanded, setExpanded] = useState<string | null>(packages[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {packages.map((pkg) => {
          const open = expanded === pkg.id
          return (
            <div key={pkg.id} className="card-flush">
              <button
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(open ? null : pkg.id)}
                aria-expanded={open}
              >
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  {open ? '▾' : '▸'}
                </span>
                <span className="min-w-[12rem] font-medium" style={{ color: 'var(--text)' }}>
                  {pkg.name}
                </span>
                <StatusPill status={pkg.status} />
                {pkg.divisionCode && <Pill tone="neutral">Div {pkg.divisionCode}</Pill>}

                <span className="ml-auto flex flex-wrap items-center gap-4 text-xs">
                  <span>
                    <span style={{ color: 'var(--text-subtle)' }}>Budget </span>
                    <span className="tnum font-medium">{money(pkg.budgetAmount)}</span>
                  </span>
                  <span>
                    <span style={{ color: 'var(--text-subtle)' }}>Low </span>
                    <span className="tnum font-medium">{money(pkg.lowLeveled)}</span>
                  </span>
                  <span>
                    <span style={{ color: 'var(--text-subtle)' }}>Under / (over) </span>
                    <Variance value={pkg.underOverBudget} />
                  </span>
                  {pkg.awardAmount > 0 && (
                    <span>
                      <span style={{ color: 'var(--text-subtle)' }}>Savings </span>
                      <Variance value={pkg.buyoutSavings} />
                    </span>
                  )}
                  <span className="tnum" style={{ color: 'var(--text-subtle)' }}>
                    {pkg.receivedCount} bid{pkg.receivedCount === 1 ? '' : 's'}
                  </span>
                </span>
              </button>

              {pkg.flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                  {pkg.flags.map((flag) => (
                    <Pill key={flag} tone="caution" dot>
                      {flag}
                    </Pill>
                  ))}
                </div>
              )}

              {open && (
                <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Bidder</th>
                          <th className="num">Base bid</th>
                          <th className="num">Leveling adjustment</th>
                          <th className="num">Leveled bid</th>
                          <th className="num">vs low</th>
                          <th className="num">vs budget</th>
                          <th className="num">Allowances</th>
                          <th>Inclusions</th>
                          <th>Exclusions</th>
                          <th>Qualifications</th>
                          <th>Status</th>
                          <th>Exceptions</th>
                          {canEdit && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {pkg.quotes.map((q) => (
                          <tr key={q.id} style={q.isLow ? { background: 'color-mix(in oklab, var(--favorable) 8%, transparent)' } : undefined}>
                            <td className="font-medium">
                              {q.vendorName}
                              {q.isLow && (
                                <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'var(--favorable)' }}>
                                  LOW
                                </span>
                              )}
                              {pkg.awardedVendorId && q.vendorId === pkg.awardedVendorId && (
                                <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>
                                  AWARDED
                                </span>
                              )}
                            </td>
                            <td className="num">{money(q.baseAmount)}</td>
                            <td className="num">
                              <Variance value={q.adjustmentAmount} favorableWhen="negative" />
                            </td>
                            <td className="num font-medium">{money(q.leveledAmount)}</td>
                            <td className="num">{q.leveledAmount > 0 ? percent(q.varianceToLowPct, 1) : '-'}</td>
                            <td className="num">
                              <Variance value={q.leveledAmount > 0 ? q.varianceToBudget : 0} />
                            </td>
                            <td className="num">{money(q.allowances)}</td>
                            <td className="max-w-[14rem] truncate" title={q.inclusions ?? ''} style={{ color: 'var(--text-muted)' }}>
                              {q.inclusions ?? '-'}
                            </td>
                            <td className="max-w-[14rem] truncate" title={q.exclusions ?? ''} style={{ color: 'var(--text-muted)' }}>
                              {q.exclusions ?? '-'}
                            </td>
                            <td className="max-w-[12rem] truncate" title={q.qualifications ?? ''} style={{ color: 'var(--text-muted)' }}>
                              {q.qualifications ?? '-'}
                            </td>
                            <td>
                              <StatusPill status={q.status} />
                            </td>
                            <td className="max-w-[16rem]">
                              {q.flags.length === 0 ? (
                                <span style={{ color: 'var(--text-subtle)' }}>-</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {q.flags.map((f) => (
                                    <Pill key={f} tone="caution">
                                      {f}
                                    </Pill>
                                  ))}
                                </div>
                              )}
                            </td>
                            {canEdit && award && (
                              <td className="no-print">
                                {q.leveledAmount > 0 && (
                                  <form
                                    action={async (formData) => {
                                      setError(null)
                                      const result = await award(formData)
                                      if (result?.error) setError(result.error)
                                    }}
                                  >
                                    <input type="hidden" name="packageId" value={pkg.id} />
                                    <input type="hidden" name="quoteId" value={q.id} />
                                    <input type="hidden" name="contextId" value={contextId} />
                                    <input type="hidden" name="contextType" value={contextType} />
                                    <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                                      Award
                                    </button>
                                  </form>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        {pkg.quotes.length === 0 && (
                          <tr>
                            <td colSpan={13} style={{ color: 'var(--text-subtle)', textAlign: 'center', padding: '1.5rem' }}>
                              No quotes have been received for this package.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {pkg.notes && (
                    <p className="border-t px-4 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                      <strong>Leveling basis:</strong> {pkg.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
