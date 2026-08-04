'use client'

import { useMemo, useState } from 'react'
import { date, money, titleize } from '@/lib/format'
import { Pill, StatusPill } from '@/components/ui'

export interface LedgerRow {
  id: string
  date: string
  type: string
  source: string
  costCode: string
  costCodeId: string
  description: string
  reference: string | null
  vendorName: string | null
  commitmentNumber: string | null
  amount: number
  hours: number | null
  needsCoding: boolean
  notes: string | null
  isDuplicate: boolean
}

type Action = (formData: FormData) => Promise<{ error?: string }>

export function CostLedger({
  projectId,
  transactions,
  costCodes,
  canEdit,
  recode,
  split,
  remove,
}: {
  projectId: string
  transactions: LedgerRow[]
  costCodes: { id: string; label: string }[]
  canEdit: boolean
  recode?: Action
  split?: Action
  remove?: Action
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [codeFilter, setCodeFilter] = useState('')
  const [flagFilter, setFlagFilter] = useState<'' | 'coding' | 'duplicate'>('')
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [mode, setMode] = useState<'recode' | 'split'>('recode')
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = transactions
    if (typeFilter) rows = rows.filter((t) => t.type === typeFilter)
    if (codeFilter) rows = rows.filter((t) => t.costCode === codeFilter)
    if (flagFilter === 'coding') rows = rows.filter((t) => t.needsCoding)
    if (flagFilter === 'duplicate') rows = rows.filter((t) => t.isDuplicate)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.costCode.toLowerCase().includes(q) ||
          (t.vendorName ?? '').toLowerCase().includes(q) ||
          (t.reference ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [transactions, search, typeFilter, codeFilter, flagFilter])

  const total = filtered.reduce((a, t) => a + t.amount, 0)
  const uniqueCodes = [...new Set(transactions.map((t) => t.costCode))].sort()

  const runAction = async (action: Action | undefined, formData: FormData) => {
    setError(null)
    const result = await action?.(formData)
    if (result?.error) setError(result.error)
    else setOpenRow(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <input
          className="field w-56 py-1.5 text-xs"
          placeholder="Search description, code, vendor or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search transactions"
        />
        <select className="field w-auto py-1.5 text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="ACTUAL">Actual</option>
          <option value="ACCRUAL">Accrual</option>
        </select>
        <select className="field w-auto py-1.5 text-xs" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} aria-label="Filter by cost code">
          <option value="">All cost codes</option>
          {uniqueCodes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="field w-auto py-1.5 text-xs"
          value={flagFilter}
          onChange={(e) => setFlagFilter(e.target.value as typeof flagFilter)}
          aria-label="Filter by review flag"
        >
          <option value="">All rows</option>
          <option value="coding">Needs coding</option>
          <option value="duplicate">Possible duplicates</option>
        </select>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-subtle)' }}>
          {filtered.length} rows · {money(total)}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      <div className="card-flush">
        <div className="table-wrap" style={{ maxHeight: '34rem', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Cost code</th>
                <th>Description</th>
                <th>Vendor</th>
                <th>Commitment</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Source</th>
                <th className="num">Hours</th>
                <th className="num">Amount</th>
                <th>Flags</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 12 : 11} style={{ color: 'var(--text-subtle)', textAlign: 'center', padding: '2rem' }}>
                    No transactions match these filters.
                  </td>
                </tr>
              )}

              {filtered.map((t) => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{date(t.date)}</td>
                  <td className="font-medium">{t.costCode}</td>
                  <td className="max-w-[20rem] truncate" title={t.description}>
                    {t.description}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{t.vendorName ?? '-'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{t.commitmentNumber ?? '-'}</td>
                  <td style={{ color: 'var(--text-subtle)' }}>{t.reference ?? '-'}</td>
                  <td>
                    <Pill tone={t.type === 'ACCRUAL' ? 'caution' : 'neutral'}>{titleize(t.type)}</Pill>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{titleize(t.source)}</td>
                  <td className="num">{t.hours ?? '-'}</td>
                  <td className="num font-medium">{money(t.amount)}</td>
                  <td>
                    <div className="flex gap-1">
                      {t.needsCoding && <StatusPill status="PENDING" label="Needs coding" />}
                      {t.isDuplicate && <StatusPill status="OVERDUE" label="Possible duplicate" />}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="no-print">
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                          onClick={() => {
                            setMode('recode')
                            setOpenRow(openRow === t.id ? null : t.id)
                          }}
                        >
                          Recode
                        </button>
                        <button
                          className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                          onClick={() => {
                            setMode('split')
                            setOpenRow(openRow === t.id ? null : t.id)
                          }}
                        >
                          Split
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {canEdit && openRow && (
                <tr>
                  <td colSpan={12} style={{ background: 'var(--surface-inset)' }}>
                    {mode === 'recode' ? (
                      <form
                        action={(formData) => runAction(recode, formData)}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="transactionId" value={openRow} />
                        <input type="hidden" name="projectId" value={projectId} />
                        <div className="min-w-[20rem] flex-1">
                          <label className="label mb-1 block" htmlFor="recode-code">
                            Move this transaction to
                          </label>
                          <select id="recode-code" name="costCodeId" required className="field py-1.5 text-xs">
                            <option value="">Select a cost code</option>
                            {costCodes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button type="submit" className="btn btn-primary py-1.5 text-xs">
                          Recode
                        </button>
                        {remove && (
                          <form action={(formData) => runAction(remove, formData)} className="inline">
                            <input type="hidden" name="transactionId" value={openRow} />
                            <button type="submit" className="btn btn-danger py-1.5 text-xs">
                              Remove from ledger
                            </button>
                          </form>
                        )}
                        <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setOpenRow(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <form action={(formData) => runAction(split, formData)} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="transactionId" value={openRow} />
                        <input type="hidden" name="projectId" value={projectId} />
                        <div>
                          <label className="label mb-1 block" htmlFor="split-amount">
                            Amount to split out
                          </label>
                          <input id="split-amount" name="splitAmount" type="number" step="0.01" min="0.01" required className="field w-36 py-1.5 text-xs" />
                        </div>
                        <div className="min-w-[18rem] flex-1">
                          <label className="label mb-1 block" htmlFor="split-code">
                            Into cost code
                          </label>
                          <select id="split-code" name="splitCostCodeId" required className="field py-1.5 text-xs">
                            <option value="">Select a cost code</option>
                            {costCodes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button type="submit" className="btn btn-primary py-1.5 text-xs">
                          Split transaction
                        </button>
                        <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setOpenRow(null)}>
                          Cancel
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9}>Total, {filtered.length} transactions</td>
                <td className="num">{money(total)}</td>
                <td colSpan={canEdit ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
