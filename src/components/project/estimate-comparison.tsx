'use client'

import { useState } from 'react'
import { money, percent } from '@/lib/format'
import { Section, Variance } from '@/components/ui'
import type { EstimateVsActualRow } from '@/lib/queries/project-estimate'

type Against = 'estimate' | 'budget'

/**
 * The estimate against what the job is actually doing.
 *
 * The comparison can be read two ways, and both matter: against the estimate
 * answers "did we price this right", against the current budget answers "are we
 * managing to the plan we set". The toggle switches which variance the table
 * emphasises rather than showing both and leaving the reader to work out which
 * one they wanted.
 */
export function EstimateComparison({
  rows,
  totals,
  estimateLabel = 'Estimated',
}: {
  rows: EstimateVsActualRow[]
  totals: EstimateVsActualRow
  /** What the priced basis is called on this project. */
  estimateLabel?: string
}) {
  const [against, setAgainst] = useState<Against>('estimate')

  const varianceOf = (row: EstimateVsActualRow) =>
    against === 'estimate' ? row.varianceToEstimate : row.varianceToBudget
  const baseOf = (row: EstimateVsActualRow) => (against === 'estimate' ? row.estimated : row.currentBudget)

  return (
    <Section
      title="What it was priced at, against what it is doing"
      description="One row per cost type. Every column is read live from the same engine as the budget and forecast pages."
      actions={
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-strong)' }}>
          {(['estimate', 'budget'] as Against[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setAgainst(option)}
              aria-pressed={against === option}
              className="px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: against === option ? 'var(--accent-soft)' : 'transparent',
                color: against === option ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {option === 'estimate' ? `Against the ${estimateLabel.toLowerCase()}` : 'Against the budget'}
            </button>
          ))}
        </div>
      }
    >
      <div className="card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ minWidth: '11rem' }}>Cost type</th>
                <th className="num" style={{ width: '9.5rem' }}>{estimateLabel}</th>
                <th className="num" style={{ width: '9.5rem' }}>Current budget</th>
                <th className="num" style={{ width: '9.5rem' }}>Committed</th>
                <th className="num" style={{ width: '9.5rem' }}>Cost to date</th>
                <th className="num" style={{ width: '9.5rem' }}>Forecast</th>
                <th className="num" style={{ width: '10rem' }}>
                  {against === 'estimate' ? `Against ${estimateLabel.toLowerCase()}` : 'Against budget'}
                </th>
                <th className="num" style={{ width: '6rem' }}>Percent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const variance = varianceOf(row)
                const base = baseOf(row)
                return (
                  <tr key={row.key}>
                    <td className="font-medium" style={{ color: 'var(--text)' }}>{row.label}</td>
                    <td className="num">{money(row.estimated)}</td>
                    <td className="num">{money(row.currentBudget)}</td>
                    <td className="num">{money(row.committed)}</td>
                    <td className="num">{money(row.costToDate)}</td>
                    <td className="num">{money(row.forecast)}</td>
                    <td className="num">
                      <Variance value={variance} />
                    </td>
                    <td className="num">
                      {base === 0 ? (
                        <span style={{ color: 'var(--text-subtle)' }}>-</span>
                      ) : (
                        <Variance value={variance / base} format="percent" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{totals.label}</td>
                <td className="num">{money(totals.estimated)}</td>
                <td className="num">{money(totals.currentBudget)}</td>
                <td className="num">{money(totals.committed)}</td>
                <td className="num">{money(totals.costToDate)}</td>
                <td className="num">{money(totals.forecast)}</td>
                <td className="num">
                  <Variance value={varianceOf(totals)} />
                </td>
                <td className="num">
                  {baseOf(totals) === 0 ? '-' : percent(varianceOf(totals) / baseOf(totals))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Section>
  )
}
