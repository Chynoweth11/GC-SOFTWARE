'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { money } from '@/lib/format'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Converting...' : 'Convert to project'}
    </button>
  )
}

export function ConvertToProjectForm({
  estimateId,
  defaultContract,
  defaultName,
  clients,
  managers,
  sections,
  action,
}: {
  estimateId: string
  defaultContract: number
  defaultName: string
  clients: { id: string; label: string }[]
  managers: { id: string; label: string }[]
  sections: { key: string; label: string; amount: number }[]
  action: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={async (formData) => {
        setError(null)
        const result = await action(formData)
        if (result?.error) setError(result.error)
      }}
      className="card space-y-4 p-4"
    >
      <input type="hidden" name="estimateId" value={estimateId} />

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <label htmlFor="cv-number" className="label mb-1.5 block">
            Job number
          </label>
          <input id="cv-number" name="number" required className="field text-xs" placeholder="26-006" />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="cv-name" className="label mb-1.5 block">
            Project name
          </label>
          <input id="cv-name" name="name" required defaultValue={defaultName} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="cv-contract" className="label mb-1.5 block">
            Contract value
          </label>
          <input id="cv-contract" name="originalContractSum" type="number" step="0.01" required defaultValue={defaultContract} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="cv-start" className="label mb-1.5 block">
            Contract start
          </label>
          <input id="cv-start" name="contractStart" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="cv-completion" className="label mb-1.5 block">
            Contract completion
          </label>
          <input id="cv-completion" name="contractCompletion" type="date" className="field text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="cv-client" className="label mb-1.5 block">
            Client
          </label>
          <select id="cv-client" name="clientId" className="field text-xs">
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cv-pm" className="label mb-1.5 block">
            Project manager
          </label>
          <select id="cv-pm" name="pmUserId" className="field text-xs">
            <option value="">Unassigned</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg p-3" style={{ background: 'var(--surface-inset)' }}>
        <h4 className="mb-2 text-xs font-semibold" style={{ color: 'var(--text)' }}>
          What gets created
        </h4>
        <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <li>
            • A budget line per trade section and cost category: {sections.length} sections, split across labor, material, equipment and
            subcontract
          </li>
          <li>• A schedule of values scaled from the budget so it ties to the contract value exactly</li>
          <li>• A planned progress curve across the contract dates, ready for the first month&apos;s billing</li>
          <li>• Every buyout package and quote from the estimate, so leveling work is not repeated</li>
          <li>• An opening forecast period at 0% complete, so the first close has a baseline</li>
          <li>• The estimate is locked and preserved exactly as it was bid</li>
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          {sections.slice(0, 6).map((s) => (
            <span key={s.key} style={{ color: 'var(--text-subtle)' }}>
              {s.label} <span className="tnum">{money(s.amount)}</span>
            </span>
          ))}
          {sections.length > 6 && <span style={{ color: 'var(--text-subtle)' }}>and {sections.length - 6} more</span>}
        </div>
      </div>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  )
}
