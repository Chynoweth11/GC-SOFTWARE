'use client'

import { useMemo, useState } from 'react'
import type { CostLine } from '@/lib/finance'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import { money, percent } from '@/lib/format'
import { Meter } from '@/components/charts/primitives'
import { Variance } from '@/components/ui'

type SortKey = 'code' | 'currentBudget' | 'totalCostToDate' | 'committed' | 'forecastAtCompletion' | 'facVariance'

/**
 * The cost-control table. Sortable and filterable client-side because the whole
 * project's lines are already loaded: round-tripping to the server to re-sort
 * a hundred rows would be slower than doing it here.
 */
export function BudgetTable({
  lines,
  canEdit,
  reviseBudget,
  projectId,
  budgetLineIdByCostCode,
}: {
  lines: CostLine[]
  canEdit: boolean
  reviseBudget?: (formData: FormData) => Promise<{ error?: string }>
  projectId: string
  budgetLineIdByCostCode: Record<string, string>
}) {
  const [sort, setSort] = useState<SortKey>('code')
  const [descending, setDescending] = useState(false)
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [onlyOverBudget, setOnlyOverBudget] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = lines
    if (category) rows = rows.filter((l) => l.category === category)
    if (onlyOverBudget) rows = rows.filter((l) => l.overBudget)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (l) =>
          l.code.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          (l.tradeName ?? '').toLowerCase().includes(q),
      )
    }
    const sorted = [...rows].sort((a, b) => {
      if (sort === 'code') return a.code.localeCompare(b.code)
      return (b[sort] as number) - (a[sort] as number)
    })
    return descending ? sorted.reverse() : sorted
  }, [lines, category, search, onlyOverBudget, sort, descending])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, l) => ({
          originalBudget: acc.originalBudget + l.originalBudget,
          budgetRevisions: acc.budgetRevisions + l.budgetRevisions,
          currentBudget: acc.currentBudget + l.currentBudget,
          committed: acc.committed + l.committed,
          totalCostToDate: acc.totalCostToDate + l.totalCostToDate,
          earnedValue: acc.earnedValue + l.earnedValue,
          costVariance: acc.costVariance + l.costVariance,
          remainingBudget: acc.remainingBudget + l.remainingBudget,
          forecastToComplete: acc.forecastToComplete + l.forecastToComplete,
          forecastAtCompletion: acc.forecastAtCompletion + l.forecastAtCompletion,
          facVariance: acc.facVariance + l.facVariance,
        }),
        {
          originalBudget: 0, budgetRevisions: 0, currentBudget: 0, committed: 0,
          totalCostToDate: 0, earnedValue: 0, costVariance: 0, remainingBudget: 0,
          forecastToComplete: 0, forecastAtCompletion: 0, facVariance: 0,
        },
      ),
    [filtered],
  )

  const header = (key: SortKey, label: string, numeric = true) => (
    <th
      className={numeric ? 'num' : undefined}
      onClick={() => {
        if (sort === key) setDescending((d) => !d)
        else {
          setSort(key)
          setDescending(false)
        }
      }}
      style={{ cursor: 'pointer' }}
      aria-sort={sort === key ? (descending ? 'descending' : 'ascending') : 'none'}
    >
      {label}
      {sort === key && <span className="ml-1">{descending ? '↓' : '↑'}</span>}
    </th>
  )

  const categories = [...new Set(lines.map((l) => l.category))]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <input
          className="field w-48 py-1.5 text-xs"
          placeholder="Search code, description or trade"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search budget lines"
        />
        <select className="field w-auto py-1.5 text-xs" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={onlyOverBudget} onChange={(e) => setOnlyOverBudget(e.target.checked)} />
          Over budget only
        </label>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-subtle)' }}>
          {filtered.length} of {lines.length} cost codes
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
                {header('code', 'Code', false)}
                <th>Description</th>
                <th>Category</th>
                <th>Trade</th>
                <th className="num">Original</th>
                <th className="num">Revisions</th>
                {header('currentBudget', 'Current budget')}
                {header('committed', 'Committed')}
                {header('totalCostToDate', 'Cost to date')}
                <th className="num">% spent</th>
                <th className="num">% complete</th>
                <th className="num">Earned value</th>
                <th className="num">Cost variance</th>
                <th className="num">Remaining</th>
                <th className="num">Forecast to complete</th>
                {header('forecastAtCompletion', 'Forecast at completion')}
                {header('facVariance', 'FAC variance')}
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.costCodeId} style={l.overBudget ? { background: 'color-mix(in oklab, var(--adverse) 5%, transparent)' } : undefined}>
                  <td className="font-medium">{l.code}</td>
                  <td className="max-w-[15rem] truncate" title={l.description}>
                    {l.description}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{CATEGORY_LABELS[l.category]}</td>
                  <td className="max-w-[10rem] truncate" style={{ color: 'var(--text-muted)' }}>
                    {l.tradeName ?? '-'}
                  </td>
                  <td className="num">{money(l.originalBudget)}</td>
                  <td className="num">
                    <Variance value={l.budgetRevisions} favorableWhen="negative" />
                  </td>
                  <td className="num font-medium">{money(l.currentBudget)}</td>
                  <td className="num">{money(l.committed)}</td>
                  <td className="num">{money(l.totalCostToDate)}</td>
                  <td className="num" style={{ color: l.pctSpent > l.effectivePctComplete + 0.1 ? 'var(--caution)' : undefined }}>
                    {percent(l.pctSpent, 0)}
                  </td>
                  <td className="num" style={{ minWidth: 90 }}>
                    <Meter value={l.effectivePctComplete} showLabel={false} height={4} />
                    <span className="tnum text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                      {percent(l.effectivePctComplete, 0)}
                    </span>
                  </td>
                  <td className="num">{money(l.earnedValue)}</td>
                  <td className="num">
                    <Variance value={l.costVariance} />
                  </td>
                  <td className="num" style={{ color: l.remainingBudget < 0 ? 'var(--adverse)' : undefined }}>
                    {money(l.remainingBudget)}
                  </td>
                  <td className="num">{money(l.forecastToComplete)}</td>
                  <td className="num font-medium">{money(l.forecastAtCompletion)}</td>
                  <td className="num">
                    <Variance value={l.facVariance} />
                  </td>
                  {canEdit && (
                    <td className="no-print">
                      <button
                        className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                        onClick={() => setEditing(editing === l.costCodeId ? null : l.costCodeId)}
                      >
                        Revise
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {canEdit &&
                editing &&
                (() => {
                  const line = filtered.find((l) => l.costCodeId === editing)
                  if (!line) return null
                  return (
                    <tr key={`${editing}-form`}>
                      <td colSpan={18} style={{ background: 'var(--surface-inset)' }}>
                        <form
                          action={async (formData: FormData) => {
                            setError(null)
                            const result = await reviseBudget?.(formData)
                            if (result?.error) setError(result.error)
                            else setEditing(null)
                          }}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="budgetLineId" value={budgetLineIdByCostCode[editing] ?? ''} />
                          <div>
                            <label className="label mb-1 block" htmlFor="revision-amount">
                              Revision to {line.code}
                            </label>
                            <input id="revision-amount" name="amount" type="number" step="0.01" required className="field w-36 py-1.5 text-xs" placeholder="0.00" />
                          </div>
                          <div className="min-w-[18rem] flex-1">
                            <label className="label mb-1 block" htmlFor="revision-reason">
                              Reason (recorded permanently)
                            </label>
                            <input id="revision-reason" name="reason" required className="field py-1.5 text-xs" placeholder="Why the budget is changing" />
                          </div>
                          <button type="submit" className="btn btn-primary py-1.5 text-xs">
                            Post revision
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
                <td colSpan={4}>Total, {filtered.length} cost codes</td>
                <td className="num">{money(totals.originalBudget)}</td>
                <td className="num">{money(totals.budgetRevisions)}</td>
                <td className="num">{money(totals.currentBudget)}</td>
                <td className="num">{money(totals.committed)}</td>
                <td className="num">{money(totals.totalCostToDate)}</td>
                <td className="num">{percent(totals.currentBudget ? totals.totalCostToDate / totals.currentBudget : 0, 0)}</td>
                <td className="num">{percent(totals.currentBudget ? totals.earnedValue / totals.currentBudget : 0, 0)}</td>
                <td className="num">{money(totals.earnedValue)}</td>
                <td className="num">
                  <Variance value={totals.costVariance} />
                </td>
                <td className="num">{money(totals.remainingBudget)}</td>
                <td className="num">{money(totals.forecastToComplete)}</td>
                <td className="num">{money(totals.forecastAtCompletion)}</td>
                <td className="num">
                  <Variance value={totals.facVariance} />
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
