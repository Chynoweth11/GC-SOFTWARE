'use client'

import { useMemo, useState } from 'react'
import { money } from '@/lib/format'
import { Pill, StatusPill } from '@/components/ui'

interface VendorRow {
  id: string
  name: string
  isSubcontractor: boolean
  tradeId: string | null
  tradeName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  w9OnFile: boolean
  glExpiration: string
  wcExpiration: string
  autoExpiration: string
  umbrellaExpiration: string
  earliestExpiration: string
  coiStatus: string
  paymentHold: boolean
  commitments: number
  invoices: number
  contractValue: number
  invoiced: number
  paid: number
  outstanding: number
}

const COI_TONE: Record<string, 'favorable' | 'caution' | 'adverse' | 'neutral'> = {
  CURRENT: 'favorable',
  EXPIRING: 'caution',
  EXPIRED: 'adverse',
  MISSING: 'neutral',
}

export function VendorManager({
  vendors,
  trades,
  save,
}: {
  vendors: VendorRow[]
  trades: { id: string; label: string }[]
  save: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [search, setSearch] = useState('')
  const [onlySubs, setOnlySubs] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = vendors
    if (onlySubs) rows = rows.filter((v) => v.isSubcontractor)
    if (onlyIssues) rows = rows.filter((v) => v.coiStatus !== 'CURRENT' || v.paymentHold || !v.w9OnFile)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((v) => v.name.toLowerCase().includes(q) || (v.tradeName ?? '').toLowerCase().includes(q))
    }
    return rows
  }, [vendors, search, onlySubs, onlyIssues])

  const editingRow = editing && editing !== 'new' ? vendors.find((v) => v.id === editing) : null

  const form = (
    <form
      action={async (formData) => {
        setError(null)
        const result = await save(formData)
        if (result?.error) setError(result.error)
        else setEditing(null)
      }}
      className="space-y-2"
    >
      {editingRow && <input type="hidden" name="vendorId" value={editingRow.id} />}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="label mb-1 block" htmlFor="v-name">Vendor name</label>
          <input id="v-name" name="name" required defaultValue={editingRow?.name ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-trade">Trade</label>
          <select id="v-trade" name="tradeId" defaultValue={editingRow?.tradeId ?? ''} className="field py-1.5 text-xs">
            <option value="">None</option>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-contact">Contact</label>
          <input id="v-contact" name="contactName" defaultValue={editingRow?.contactName ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-phone">Phone</label>
          <input id="v-phone" name="phone" defaultValue={editingRow?.phone ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-email">Email</label>
          <input id="v-email" name="email" type="email" defaultValue={editingRow?.email ?? ''} className="field py-1.5 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="label mb-1 block" htmlFor="v-address">Address</label>
          <input id="v-address" name="address" defaultValue={editingRow?.address ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-gl">GL insurance expires</label>
          <input id="v-gl" name="glExpiration" type="date" defaultValue={editingRow?.glExpiration ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-wc">Workers comp expires</label>
          <input id="v-wc" name="wcExpiration" type="date" defaultValue={editingRow?.wcExpiration ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-auto">Auto expires</label>
          <input id="v-auto" name="autoExpiration" type="date" defaultValue={editingRow?.autoExpiration ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="v-umb">Umbrella expires</label>
          <input id="v-umb" name="umbrellaExpiration" type="date" defaultValue={editingRow?.umbrellaExpiration ?? ''} className="field py-1.5 text-xs" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" name="isSubcontractor" defaultChecked={editingRow?.isSubcontractor ?? true} />
          Subcontractor (not a material vendor)
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" name="w9OnFile" defaultChecked={editingRow?.w9OnFile ?? false} />
          W-9 on file
        </label>
        <div className="ml-auto flex gap-2">
          <button type="submit" className="btn btn-primary py-1.5 text-xs">
            {editingRow ? 'Save vendor' : 'Add vendor'}
          </button>
          <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <input
          className="field w-56 py-1.5 text-xs"
          placeholder="Search vendor or trade"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search vendors"
        />
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={onlySubs} onChange={(e) => setOnlySubs(e.target.checked)} />
          Subcontractors only
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Compliance issues only
        </label>
        <button className="btn btn-secondary ml-auto py-1.5 text-xs" onClick={() => setEditing(editing === 'new' ? null : 'new')}>
          Add vendor
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
                <th>Vendor</th>
                <th>Trade</th>
                <th>Contact</th>
                <th>Type</th>
                <th className="num">Commitments</th>
                <th className="num">Contract value</th>
                <th className="num">Invoiced</th>
                <th className="num">Paid</th>
                <th className="num">Outstanding</th>
                <th>Earliest insurance expiry</th>
                <th>Insurance</th>
                <th>W-9</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td className="font-medium">{v.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{v.tradeName ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{v.contactName ?? '—'}</td>
                  <td>{v.isSubcontractor ? <Pill tone="accent">Subcontractor</Pill> : <Pill tone="neutral">Vendor</Pill>}</td>
                  <td className="num">{v.commitments}</td>
                  <td className="num">{money(v.contractValue)}</td>
                  <td className="num">{money(v.invoiced)}</td>
                  <td className="num">{money(v.paid)}</td>
                  <td className="num" style={{ color: v.outstanding > 0 ? 'var(--caution)' : undefined }}>
                    {money(v.outstanding)}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{v.earliestExpiration}</td>
                  <td>
                    <Pill tone={COI_TONE[v.coiStatus]}>
                      {v.coiStatus === 'CURRENT' ? 'Current' : v.coiStatus === 'EXPIRING' ? 'Expiring' : v.coiStatus === 'EXPIRED' ? 'Expired' : 'Missing'}
                    </Pill>
                  </td>
                  <td>{v.w9OnFile ? <Pill tone="favorable">On file</Pill> : <Pill tone="caution">Missing</Pill>}</td>
                  <td>{v.paymentHold ? <Pill tone="adverse">Hold</Pill> : <Pill tone="favorable">Clear</Pill>}</td>
                  <td className="no-print">
                    <button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => setEditing(editing === v.id ? null : v.id)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {editingRow && (
                <tr>
                  <td colSpan={14} style={{ background: 'var(--surface-inset)' }}>
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
