'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { money, titleize } from '@/lib/format'
import { Pill } from '@/components/ui'
import { ConfirmButton } from '@/components/ui/confirm-button'

export interface ClientRow {
  id: string
  name: string
  type: string
  active: boolean
  contact: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  projectCount: number
  bidCount: number
  contractValue: number
}

const CLIENT_TYPES = ['COMMERCIAL', 'RESIDENTIAL', 'PUBLIC', 'DEVELOPER', 'INSTITUTIONAL', 'OTHER']

export function ClientManager({
  clients,
  canDelete,
  save,
  setActive,
  remove,
}: {
  clients: ClientRow[]
  canDelete: boolean
  save: (formData: FormData) => Promise<{ error?: string }>
  setActive: (formData: FormData) => Promise<{ error?: string }>
  remove: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    let rows = clients
    if (!showArchived) rows = rows.filter((c) => c.active)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.contact ?? '').toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [clients, search, showArchived])

  const editingRow = editing && editing !== 'new' ? clients.find((c) => c.id === editing) : null

  async function run(action: (formData: FormData) => Promise<{ error?: string }>, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) setError(result.error)
    return !result?.error
  }

  const form = (
    <form
      action={async (formData) => {
        if (await run(save, formData)) setEditing(null)
      }}
      className="card mb-3 p-4"
    >
      <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {editingRow ? `Edit ${editingRow.name}` : 'New client'}
      </h3>
      {editingRow && <input type="hidden" name="id" value={editingRow.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label htmlFor="client-name" className="label mb-1.5 block">
            Client name
          </label>
          <input id="client-name" name="name" required defaultValue={editingRow?.name ?? ''} className="field" />
        </div>
        <div>
          <label htmlFor="client-type" className="label mb-1.5 block">
            Type
          </label>
          <select id="client-type" name="type" defaultValue={editingRow?.type ?? 'COMMERCIAL'} className="field">
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleize(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="client-contact" className="label mb-1.5 block">
            Main contact
          </label>
          <input id="client-contact" name="contact" defaultValue={editingRow?.contact ?? ''} className="field" />
        </div>
        <div>
          <label htmlFor="client-phone" className="label mb-1.5 block">
            Phone
          </label>
          <input id="client-phone" name="phone" defaultValue={editingRow?.phone ?? ''} className="field" />
        </div>
        <div>
          <label htmlFor="client-email" className="label mb-1.5 block">
            Email
          </label>
          <input id="client-email" name="email" type="email" defaultValue={editingRow?.email ?? ''} className="field" />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="client-address" className="label mb-1.5 block">
            Address
          </label>
          <input id="client-address" name="address" defaultValue={editingRow?.address ?? ''} className="field" />
        </div>
        <div className="lg:col-span-3">
          <label htmlFor="client-notes" className="label mb-1.5 block">
            Notes
          </label>
          <input id="client-notes" name="notes" defaultValue={editingRow?.notes ?? ''} className="field" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Saving' : editingRow ? 'Save changes' : 'Add client'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </form>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients"
          className="field h-8 max-w-xs text-xs"
          aria-label="Search clients"
        />
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-subtle)' }}>
          {filtered.length} of {clients.length}
        </span>
        {editing === null && (
          <button type="button" className="btn btn-primary text-xs" onClick={() => setEditing('new')}>
            New client
          </button>
        )}
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {editing !== null && form}

      <div className="card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="num">Projects</th>
                <th className="num">Bids</th>
                <th className="num">Contract value</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} style={client.active ? undefined : { opacity: 0.6 }}>
                  <td className="font-medium">{client.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{titleize(client.type)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{client.contact ?? 'Not recorded'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{client.phone ?? 'Not recorded'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{client.email ?? 'Not recorded'}</td>
                  <td className="num">
                    {client.projectCount > 0 ? (
                      <Link href={`/projects?client=${client.id}`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                        {client.projectCount}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="num">{client.bidCount}</td>
                  <td className="num">{money(client.contractValue)}</td>
                  <td>
                    {client.active ? (
                      <Pill tone="favorable" dot>
                        Active
                      </Pill>
                    ) : (
                      <Pill tone="neutral" dot>
                        Archived
                      </Pill>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(client.id)}>
                        Edit
                      </button>
                      <form
                        action={async (formData) => {
                          await run(setActive, formData)
                        }}
                      >
                        <input type="hidden" name="id" value={client.id} />
                        <input type="hidden" name="active" value={String(!client.active)} />
                        <button type="submit" className="btn btn-ghost text-xs" disabled={busy}>
                          {client.active ? 'Archive' : 'Restore'}
                        </button>
                      </form>
                      {canDelete && client.projectCount === 0 && client.bidCount === 0 && (
                        <ConfirmButton
                          label="Delete"
                          confirmLabel="Confirm delete"
                          title={`Delete ${client.name}`}
                          description="This client has no projects or bids, so it can be removed entirely. The audit history keeps a permanent record of the deletion."
                          tone="adverse"
                          onConfirm={async () => {
                            const formData = new FormData()
                            formData.set('id', client.id)
                            await run(remove, formData)
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
