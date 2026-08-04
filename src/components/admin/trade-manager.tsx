'use client'

import { useState } from 'react'
import { Pill } from '@/components/ui'

interface TradeRow {
  id: string
  name: string
  divisionId: string | null
  divisionLabel: string | null
  active: boolean
  costCodes: number
  budgetLines: number
  vendors: number
}

export function TradeManager({
  trades,
  divisions,
  save,
  toggle,
}: {
  trades: TradeRow[]
  divisions: { id: string; label: string }[]
  save: (formData: FormData) => Promise<{ error?: string }>
  toggle: (formData: FormData) => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visible = showRetired ? trades : trades.filter((t) => t.active)
  const editingRow = editing && editing !== 'new' ? trades.find((t) => t.id === editing) : null

  const form = (
    <form
      action={async (formData) => {
        setError(null)
        const result = await save(formData)
        if (result?.error) setError(result.error)
        else setEditing(null)
      }}
      className="flex flex-wrap items-end gap-2"
    >
      {editingRow && <input type="hidden" name="tradeId" value={editingRow.id} />}
      <div className="min-w-[18rem] flex-1">
        <label className="label mb-1 block" htmlFor="t-name">Trade / scope name</label>
        <input id="t-name" name="name" required defaultValue={editingRow?.name ?? ''} className="field py-1.5 text-xs" />
      </div>
      <div>
        <label className="label mb-1 block" htmlFor="t-div">CSI division</label>
        <select id="t-div" name="divisionId" defaultValue={editingRow?.divisionId ?? ''} className="field w-56 py-1.5 text-xs">
          <option value="">None</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary py-1.5 text-xs">
        {editingRow ? 'Save trade' : 'Add trade'}
      </button>
      <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setEditing(null)}>
        Cancel
      </button>
    </form>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          Show retired
        </label>
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          {visible.length} of {trades.length} trades
        </span>
        <button className="btn btn-secondary ml-auto py-1.5 text-xs" onClick={() => setEditing(editing === 'new' ? null : 'new')}>
          Add trade
        </button>
      </div>

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      {editing === 'new' && <div className="card p-3">{form}</div>}

      <div className="card-flush">
        <div className="table-wrap" style={{ maxHeight: '34rem', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Trade / scope</th>
                <th>CSI division</th>
                <th className="num">Budget lines</th>
                <th className="num">Budget lines</th>
                <th className="num">Vendors</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} style={t.active ? undefined : { opacity: 0.6 }}>
                  <td className="font-medium">{t.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{t.divisionLabel ?? '-'}</td>
                  <td className="num">{t.costCodes}</td>
                  <td className="num">{t.budgetLines}</td>
                  <td className="num">{t.vendors}</td>
                  <td>{t.active ? <Pill tone="favorable">Active</Pill> : <Pill tone="neutral">Retired</Pill>}</td>
                  <td className="no-print">
                    <div className="flex gap-1">
                      <button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                        Edit
                      </button>
                      <form action={toggle}>
                        <input type="hidden" name="tradeId" value={t.id} />
                        <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                          {t.active ? 'Retire' : 'Reinstate'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {editingRow && (
                <tr>
                  <td colSpan={7} style={{ background: 'var(--surface-inset)' }}>
                    {form}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
