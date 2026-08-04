'use client'

import { useState } from 'react'
import { titleize } from '@/lib/format'

const STATUSES = ['BIDDING', 'AWARDED', 'PRECONSTRUCTION', 'UNDER_CONSTRUCTION', 'ACTIVE', 'ON_HOLD']

/**
 * Creating a job.
 *
 * Deliberately short. Only the fields needed to open a project are asked for
 * here; everything else has a company default and is edited on the settings tab
 * once the job exists.
 */
export function NewProjectForm({
  clients,
  managers,
  create,
}: {
  clients: { id: string; name: string }[]
  managers: { id: string; name: string }[]
  create: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        New project
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="New project"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <form
        action={async (formData) => {
          setBusy(true)
          setError(null)
          const result = await create(formData)
          setBusy(false)
          // A successful create redirects, so reaching here means it failed.
          if (result?.error) setError(result.error)
        }}
        className="mt-10 w-full max-w-2xl overflow-hidden rounded-xl border shadow-xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            New project
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Retention, target margin, labour burden and overhead are taken from the company defaults and can be changed on the
            project once it exists.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <div>
            <label htmlFor="np-number" className="label mb-1.5 block">
              Job number
            </label>
            <input id="np-number" name="number" required placeholder="26-004" className="field" />
          </div>
          <div>
            <label htmlFor="np-status" className="label mb-1.5 block">
              Status
            </label>
            <select id="np-status" name="status" defaultValue="ACTIVE" className="field">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleize(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="np-name" className="label mb-1.5 block">
              Project name
            </label>
            <input id="np-name" name="name" required placeholder="Riverside Medical Office Building" className="field" />
          </div>
          <div>
            <label htmlFor="np-client" className="label mb-1.5 block">
              Client
            </label>
            <select id="np-client" name="clientId" className="field" defaultValue="">
              <option value="">Not assigned</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="np-pm" className="label mb-1.5 block">
              Project manager
            </label>
            <select id="np-pm" name="pmUserId" className="field" defaultValue="">
              <option value="">Not assigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="np-type" className="label mb-1.5 block">
              Project type
            </label>
            <input id="np-type" name="projectType" placeholder="Commercial" className="field" />
          </div>
          <div>
            <label htmlFor="np-contract" className="label mb-1.5 block">
              Original contract sum
            </label>
            <input id="np-contract" name="originalContractSum" type="number" min="0" step="0.01" defaultValue={0} className="field tnum" />
          </div>
          <div>
            <label htmlFor="np-city" className="label mb-1.5 block">
              City
            </label>
            <input id="np-city" name="city" className="field" />
          </div>
          <div>
            <label htmlFor="np-state" className="label mb-1.5 block">
              State
            </label>
            <input id="np-state" name="state" maxLength={2} className="field" />
          </div>
          <div>
            <label htmlFor="np-start" className="label mb-1.5 block">
              Contract start
            </label>
            <input id="np-start" name="contractStart" type="date" className="field" />
          </div>
          <div>
            <label htmlFor="np-finish" className="label mb-1.5 block">
              Contract completion
            </label>
            <input id="np-finish" name="contractCompletion" type="date" className="field" />
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
            {error}
          </div>
        )}

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)' }}
        >
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  )
}
