'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  )
}

function Notice({ error, saved }: { error: string | null; saved: string | null }) {
  if (error)
    return (
      <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
        {error}
      </div>
    )
  if (saved)
    return (
      <div
        className="rounded-lg border px-3 py-2 text-xs"
        style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 40%, transparent)', color: 'var(--favorable)' }}
        role="status"
      >
        {saved}
      </div>
    )
  return null
}

export function CommitmentForm({
  projectId,
  vendors,
  costCodes,
  defaultRetentionPct,
  action,
  commitments,
  changeAction,
}: {
  projectId: string
  vendors: { id: string; label: string }[]
  costCodes: { id: string; label: string }[]
  defaultRetentionPct: number
  action: (formData: FormData) => Promise<{ error?: string }>
  commitments: { id: string; label: string }[]
  changeAction: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [tab, setTab] = useState<'new' | 'change'>('new')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const run = async (fn: (fd: FormData) => Promise<{ error?: string }>, fd: FormData, message: string) => {
    setError(null)
    setSaved(null)
    const result = await fn(fd)
    if (result?.error) setError(result.error)
    else setSaved(message)
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-1">
        {(
          [
            ['new', 'New commitment'],
            ['change', 'Commitment change'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="btn text-xs"
            style={{
              background: tab === key ? 'var(--accent-soft)' : 'transparent',
              color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <Notice error={error} saved={saved} />
      </div>

      {tab === 'new' ? (
        <form
          action={(fd) => run(action, fd, 'Commitment created. It now shows against the budget and in the forecast.')}
          className="space-y-3"
        >
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <label htmlFor="c-type" className="label mb-1.5 block">
                Type
              </label>
              <select id="c-type" name="type" className="field text-xs" defaultValue="SUBCONTRACT">
                <option value="SUBCONTRACT">Subcontract</option>
                <option value="PURCHASE_ORDER">Purchase order</option>
                <option value="MATERIAL">Material commitment</option>
                <option value="EQUIPMENT">Equipment commitment</option>
                <option value="SERVICE">Service agreement</option>
              </select>
            </div>
            <div>
              <label htmlFor="c-number" className="label mb-1.5 block">
                Number
              </label>
              <input id="c-number" name="number" required className="field text-xs" placeholder="26-001-SC-05" />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="c-vendor" className="label mb-1.5 block">
                Vendor / subcontractor
              </label>
              <select id="c-vendor" name="vendorId" required className="field text-xs">
                <option value="">Select</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label htmlFor="c-code" className="label mb-1.5 block">
                Line item
              </label>
              <select id="c-code" name="costCodeId" required className="field text-xs">
                <option value="">Select</option>
                {costCodes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="c-amount" className="label mb-1.5 block">
                Contract value
              </label>
              <input id="c-amount" name="originalAmount" type="number" step="0.01" min="0.01" required className="field text-xs" placeholder="0.00" />
            </div>
            <div>
              <label htmlFor="c-retention" className="label mb-1.5 block">
                Retention (0–1)
              </label>
              <input
                id="c-retention"
                name="retentionPct"
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="field text-xs"
                defaultValue={defaultRetentionPct}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label htmlFor="c-scope" className="label mb-1.5 block">
                Scope of work
              </label>
              <input id="c-scope" name="scopeOfWork" className="field text-xs" placeholder="What this vendor is contracted to do" />
            </div>
            <div>
              <label htmlFor="c-issued" className="label mb-1.5 block">
                Date issued
              </label>
              <input id="c-issued" name="dateIssued" type="date" className="field text-xs" />
            </div>
            <div>
              <label htmlFor="c-delivery" className="label mb-1.5 block">
                Expected delivery
              </label>
              <input id="c-delivery" name="expectedDelivery" type="date" className="field text-xs" />
            </div>
          </div>

          <div className="flex justify-end">
            <Submit label="Create commitment" />
          </div>
        </form>
      ) : (
        <form
          action={(fd) => run(changeAction, fd, 'Change recorded. Approved changes raise the committed value immediately.')}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label htmlFor="cc-commitment" className="label mb-1.5 block">
                Commitment
              </label>
              <select id="cc-commitment" name="commitmentId" required className="field text-xs">
                <option value="">Select</option>
                {commitments.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cc-number" className="label mb-1.5 block">
                Change number
              </label>
              <input id="cc-number" name="changeNumber" required className="field text-xs" placeholder="SCO-003" />
            </div>
            <div>
              <label htmlFor="cc-amount" className="label mb-1.5 block">
                Amount
              </label>
              <input id="cc-amount" name="changeAmount" type="number" step="0.01" required className="field text-xs" />
            </div>
            <div>
              <label htmlFor="cc-status" className="label mb-1.5 block">
                Status
              </label>
              <select id="cc-status" name="changeStatus" className="field text-xs" defaultValue="PENDING">
                <option value="PENDING">Pending</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="VOID">Void</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cc-description" className="label mb-1.5 block">
              Description
            </label>
            <input id="cc-description" name="changeDescription" required className="field text-xs" placeholder="What changed and why" />
          </div>

          <div className="flex justify-end">
            <Submit label="Record change" />
          </div>
        </form>
      )}
    </div>
  )
}
