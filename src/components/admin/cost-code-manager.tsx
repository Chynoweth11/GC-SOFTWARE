'use client'

import { useMemo, useState } from 'react'
import { Pill } from '@/components/ui'

interface CostCodeRow {
  id: string
  code: string
  description: string
  category: string
  divisionId: string | null
  divisionLabel: string | null
  tradeId: string | null
  tradeName: string | null
  active: boolean
  inUse: number
}

export function CostCodeManager({
  costCodes,
  divisions,
  trades,
  categories,
  save,
  toggle,
}: {
  costCodes: CostCodeRow[]
  divisions: { id: string; label: string }[]
  trades: { id: string; label: string }[]
  categories: { value: string; label: string }[]
  save: (formData: FormData) => Promise<{ error?: string }>
  toggle: (formData: FormData) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = costCodes
    if (!showRetired) rows = rows.filter((c) => c.active)
    if (categoryFilter) rows = rows.filter((c) => c.category === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    }
    return rows
  }, [costCodes, search, categoryFilter, showRetired])

  const editingRow = editing && editing !== 'new' ? costCodes.find((c) => c.id === editing) : null

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
      {editingRow && <input type="hidden" name="costCodeId" value={editingRow.id} />}
      <div>
        <label className="label mb-1 block" htmlFor="cc-code">Code</label>
        <input id="cc-code" name="code" required defaultValue={editingRow?.code ?? ''} className="field w-32 py-1.5 text-xs" />
      </div>
      <div className="min-w-[18rem] flex-1">
        <label className="label mb-1 block" htmlFor="cc-desc">Description</label>
        <input id="cc-desc" name="description" required defaultValue={editingRow?.description ?? ''} className="field py-1.5 text-xs" />
      </div>
      <div>
        <label className="label mb-1 block" htmlFor="cc-cat">Category</label>
        <select id="cc-cat" name="category" defaultValue={editingRow?.category ?? 'SUBCONTRACT'} className="field w-44 py-1.5 text-xs">
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label mb-1 block" htmlFor="cc-div">CSI division</label>
        <select id="cc-div" name="divisionId" defaultValue={editingRow?.divisionId ?? ''} className="field w-52 py-1.5 text-xs">
          <option value="">None</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label mb-1 block" htmlFor="cc-trade">Trade</label>
        <select id="cc-trade" name="tradeId" defaultValue={editingRow?.tradeId ?? ''} className="field w-52 py-1.5 text-xs">
          <option value="">None</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary py-1.5 text-xs">
        {editingRow ? 'Save cost code' : 'Add cost code'}
      </button>
      <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setEditing(null)}>
        Cancel
      </button>
    </form>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <input
          className="field w-56 py-1.5 text-xs"
          placeholder="Search code or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search cost codes"
        />
        <select className="field w-auto py-1.5 text-xs" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          Show retired
        </label>
        <button className="btn btn-secondary ml-auto py-1.5 text-xs" onClick={() => setEditing(editing === 'new' ? null : 'new')}>
          Add cost code
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
                <th>Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>CSI division</th>
                <th>Trade</th>
                <th className="num">Records referencing it</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={c.active ? undefined : { opacity: 0.6 }}>
                  <td className="font-medium">{c.code}</td>
                  <td className="max-w-[24rem] truncate">{c.description}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{categories.find((x) => x.value === c.category)?.label ?? c.category}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.divisionLabel ?? '-'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.tradeName ?? '-'}</td>
                  <td className="num">{c.inUse}</td>
                  <td>{c.active ? <Pill tone="favorable">Active</Pill> : <Pill tone="neutral">Retired</Pill>}</td>
                  <td className="no-print">
                    <div className="flex gap-1">
                      <button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => setEditing(editing === c.id ? null : c.id)}>
                        Edit
                      </button>
                      <form action={toggle}>
                        <input type="hidden" name="costCodeId" value={c.id} />
                        <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                          {c.active ? 'Retire' : 'Reinstate'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {editingRow && (
                <tr>
                  <td colSpan={8} style={{ background: 'var(--surface-inset)' }}>
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
