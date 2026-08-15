'use client'

import { useState } from 'react'
import type { ForecastComparisonRow } from '@/lib/finance'
import { money, percent } from '@/lib/format'
import { StatusPill, Variance } from '@/components/ui'
import { Meter } from '@/components/charts/primitives'

export function ForecastTable({
  rows,
  projectId,
  periodId,
  canEdit,
  save,
}: {
  rows: ForecastComparisonRow[]
  projectId: string
  periodId: string
  canEdit: boolean
  save: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyMovers, setOnlyMovers] = useState(false)

  const visible = onlyMovers ? rows.filter((r) => Math.abs(r.delta) > 0.005) : rows

  const totals = visible.reduce(
    (a, r) => ({
      currentBudget: a.currentBudget + r.currentBudget,
      costToDate: a.costToDate + r.costToDate,
      committed: a.committed + r.committed,
      previousEac: a.previousEac + r.previousEac,
      currentEac: a.currentEac + r.currentEac,
      delta: a.delta + r.delta,
    }),
    { currentBudget: 0, costToDate: 0, committed: 0, previousEac: 0, currentEac: 0, delta: 0 },
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={onlyMovers} onChange={(e) => setOnlyMovers(e.target.checked)} />
          Only lines that moved this period
        </label>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-subtle)' }}>
          {visible.length} of {rows.length} line items
        </span>
      </div>

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      <div className="card-flush">
        <div className="table-wrap" style={{ maxHeight: '38rem', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th className="num">Current budget</th>
                <th className="num">Cost to date</th>
                <th className="num">Committed</th>
                <th style={{ minWidth: 100 }}>% complete</th>
                <th className="num">Estimate to complete</th>
                <th className="num">Previous EAC</th>
                <th className="num">Current EAC</th>
                <th className="num">Movement</th>
                <th className="num">Variance to budget</th>
                <th>Risk</th>
                <th>Explanation</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const variance = r.currentBudget - r.currentEac
                const etc = r.currentEac - r.costToDate
                return (
                  <tr key={r.costCodeId} style={variance < -0.005 ? { background: 'color-mix(in oklab, var(--adverse) 5%, transparent)' } : undefined}>
                    <td className="font-medium">{r.code}</td>
                    <td className="max-w-[14rem] truncate" title={r.description}>
                      {r.description}
                    </td>
                    <td className="num">{money(r.currentBudget)}</td>
                    <td className="num">{money(r.costToDate)}</td>
                    <td className="num">{money(r.committed)}</td>
                    <td>
                      <Meter value={r.pctComplete} showLabel={false} height={4} />
                      <span className="tnum text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                        {percent(r.pctComplete)}
                      </span>
                    </td>
                    <td className="num">{money(etc)}</td>
                    <td className="num">{money(r.previousEac)}</td>
                    <td className="num font-medium">{money(r.currentEac)}</td>
                    <td className="num">
                      <Variance value={-r.delta} />
                    </td>
                    <td className="num">
                      <Variance value={variance} />
                    </td>
                    <td>
                      <StatusPill status={r.riskLevel} />
                    </td>
                    <td className="max-w-[18rem] truncate" title={r.note ?? ''} style={{ color: r.note ? 'var(--text-muted)' : 'var(--text-subtle)' }}>
                      {r.note ?? (Math.abs(r.delta) > 5_000 ? 'Explanation required' : '-')}
                    </td>
                    {canEdit && (
                      <td className="no-print">
                        <button
                          className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                          onClick={() => setEditing(editing === r.costCodeId ? null : r.costCodeId)}
                        >
                          Forecast
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}

              {canEdit &&
                editing &&
                (() => {
                  const row = visible.find((r) => r.costCodeId === editing)
                  if (!row) return null
                  return (
                    <tr>
                      <td colSpan={14} style={{ background: 'var(--surface-inset)' }}>
                        <form
                          action={async (formData) => {
                            setError(null)
                            const result = await save(formData)
                            if (result?.error) setError(result.error)
                            else setEditing(null)
                          }}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="periodId" value={periodId} />
                          <input type="hidden" name="costCodeId" value={row.costCodeId} />

                          <div>
                            <label className="label mb-1 block" htmlFor="fc-pct">
                              % complete: {row.code}
                            </label>
                            <input
                              id="fc-pct"
                              name="pctComplete"
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              required
                              defaultValue={row.pctComplete.toFixed(2)}
                              className="field w-28 py-1.5 text-xs"
                            />
                          </div>

                          <div>
                            <label className="label mb-1 block" htmlFor="fc-etc">
                              Estimate to complete
                            </label>
                            <input
                              id="fc-etc"
                              name="etcOverride"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Derive from budget"
                              className="field w-40 py-1.5 text-xs"
                            />
                          </div>

                          <div>
                            <label className="label mb-1 block" htmlFor="fc-risk">
                              Risk
                            </label>
                            <select id="fc-risk" name="riskLevel" defaultValue={row.riskLevel} className="field w-28 py-1.5 text-xs">
                              <option value="LOW">Low</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HIGH">High</option>
                            </select>
                          </div>

                          <div>
                            <label className="label mb-1 block" htmlFor="fc-confidence">
                              Confidence
                            </label>
                            <input
                              id="fc-confidence"
                              name="confidence"
                              type="number"
                              step="0.05"
                              min="0"
                              max="1"
                              defaultValue="0.8"
                              className="field w-24 py-1.5 text-xs"
                            />
                          </div>

                          <div className="min-w-[20rem] flex-1">
                            <label className="label mb-1 block" htmlFor="fc-note">
                              Why the forecast changed
                            </label>
                            <input
                              id="fc-note"
                              name="note"
                              defaultValue={row.note ?? ''}
                              className="field py-1.5 text-xs"
                              placeholder="Required for movements over $5,000"
                            />
                          </div>

                          <button type="submit" className="btn btn-primary py-1.5 text-xs">
                            Save forecast
                          </button>
                          <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )
                })()}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total, {visible.length} line items</td>
                <td className="num">{money(totals.currentBudget)}</td>
                <td className="num">{money(totals.costToDate)}</td>
                <td className="num">{money(totals.committed)}</td>
                <td />
                <td className="num">{money(totals.currentEac - totals.costToDate)}</td>
                <td className="num">{money(totals.previousEac)}</td>
                <td className="num">{money(totals.currentEac)}</td>
                <td className="num">
                  <Variance value={-totals.delta} />
                </td>
                <td className="num">
                  <Variance value={totals.currentBudget - totals.currentEac} />
                </td>
                <td colSpan={canEdit ? 3 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
