'use client'

import { useState } from 'react'
import { date, money, percent } from '@/lib/format'
import { Pill, Variance } from '@/components/ui'

export interface CashRow {
  periodEnd: string
  isActual: boolean
  plannedDeltaPct: number
  plannedCumPct: number
  plannedValue: number
  actualPctComplete: number | null
  earnedValue: number | null
  actualCost: number | null
  forecastCost: number
  totalCost: number
  cumulativeCost: number
  billings: number
  cumulativeBillings: number
  cashIn: number
  cumulativeCash: number
  scheduleVariance: number | null
  overUnderBilled: number | null
  netCash: number
}

export function CashFlowEditor({
  projectId,
  rows,
  canEdit,
  save,
}: {
  projectId: string
  rows: CashRow[]
  canEdit: boolean
  save: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3">
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
                <th>Month end</th>
                <th />
                <th className="num">Planned Δ%</th>
                <th className="num">Planned cum %</th>
                <th className="num">Planned value</th>
                <th className="num">Actual %</th>
                <th className="num">Earned value</th>
                <th className="num">Actual cost</th>
                <th className="num">Forecast cost</th>
                <th className="num">Cumulative cost</th>
                <th className="num">Billings</th>
                <th className="num">Cumulative billings</th>
                <th className="num">Cash in</th>
                <th className="num">Cumulative cash</th>
                <th className="num">Schedule variance</th>
                <th className="num">Over / (under) billed</th>
                <th className="num">Net cash</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.periodEnd}>
                  <td className="font-medium">{date(r.periodEnd)}</td>
                  <td>{r.isActual ? <Pill tone="neutral">Actual</Pill> : <Pill tone="accent">Forecast</Pill>}</td>
                  <td className="num">{percent(r.plannedDeltaPct, 1)}</td>
                  <td className="num">{percent(r.plannedCumPct, 1)}</td>
                  <td className="num">{money(r.plannedValue)}</td>
                  <td className="num">{r.actualPctComplete == null ? '-' : percent(r.actualPctComplete, 1)}</td>
                  <td className="num">{r.earnedValue == null ? '-' : money(r.earnedValue)}</td>
                  <td className="num">{r.actualCost == null ? '-' : money(r.actualCost)}</td>
                  <td className="num">{money(r.forecastCost)}</td>
                  <td className="num">{money(r.cumulativeCost)}</td>
                  <td className="num">{money(r.billings)}</td>
                  <td className="num">{money(r.cumulativeBillings)}</td>
                  <td className="num">{money(r.cashIn)}</td>
                  <td className="num">{money(r.cumulativeCash)}</td>
                  <td className="num">{r.scheduleVariance == null ? '-' : <Variance value={r.scheduleVariance} />}</td>
                  <td className="num">{r.overUnderBilled == null ? '-' : <Variance value={r.overUnderBilled} />}</td>
                  <td className="num font-medium" style={{ color: r.netCash < 0 ? 'var(--adverse)' : 'var(--favorable)' }}>
                    {money(r.netCash)}
                  </td>
                  {canEdit && (
                    <td className="no-print">
                      <button
                        className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                        onClick={() => setEditing(editing === r.periodEnd ? null : r.periodEnd)}
                      >
                        Adjust
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {canEdit &&
                editing &&
                (() => {
                  const row = rows.find((r) => r.periodEnd === editing)
                  if (!row) return null
                  return (
                    <tr>
                      <td colSpan={18} style={{ background: 'var(--surface-inset)' }}>
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
                          <input type="hidden" name="periodEnd" value={row.periodEnd} />

                          <div>
                            <label className="label mb-1 block" htmlFor="cf-planned">
                              Planned progress: {date(row.periodEnd)}
                            </label>
                            <input
                              id="cf-planned"
                              name="plannedDeltaPct"
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              required
                              defaultValue={row.plannedDeltaPct.toFixed(2)}
                              className="field w-28 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="label mb-1 block" htmlFor="cf-billing">
                              Billing override
                            </label>
                            <input id="cf-billing" name="billingOverride" type="number" step="0.01" className="field w-40 py-1.5 text-xs" placeholder="Use the derived spread" />
                          </div>
                          <div>
                            <label className="label mb-1 block" htmlFor="cf-collection">
                              Collection override
                            </label>
                            <input id="cf-collection" name="collectionOverride" type="number" step="0.01" className="field w-40 py-1.5 text-xs" placeholder="Use the lag model" />
                          </div>
                          <div className="min-w-[16rem] flex-1">
                            <label className="label mb-1 block" htmlFor="cf-notes">
                              Notes
                            </label>
                            <input id="cf-notes" name="notes" className="field py-1.5 text-xs" placeholder="Why this month differs from the model" />
                          </div>
                          <button type="submit" className="btn btn-primary py-1.5 text-xs">
                            Save month
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
          </table>
        </div>
      </div>
    </div>
  )
}
