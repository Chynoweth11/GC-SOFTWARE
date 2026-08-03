'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { ImportResult } from '@/app/(app)/admin/import/actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Importing…' : 'Import transactions'}
    </button>
  )
}

export function ImportForm({
  projects,
  action,
}: {
  projects: { id: string; label: string }[]
  action: (formData: FormData) => Promise<ImportResult>
}) {
  const [result, setResult] = useState<ImportResult | null>(null)

  return (
    <form
      action={async (formData) => {
        setResult(null)
        setResult(await action(formData))
      }}
      className="card space-y-3 p-4"
    >
      {result?.error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {result.error}
        </div>
      )}

      {result?.message && (
        <div
          className="rounded-lg border px-3 py-2.5 text-xs"
          style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 40%, transparent)', color: 'var(--favorable)' }}
          role="status"
        >
          <p className="font-medium">{result.message}</p>
          <ul className="mt-1 space-y-0.5">
            <li>Imported: {result.imported}</li>
            <li>Duplicates skipped: {result.skippedDuplicates}</li>
            <li>Needing a cost code: {result.needsCoding}</li>
          </ul>
          {result.unmatchedCodes && result.unmatchedCodes.length > 0 && (
            <p className="mt-1.5">
              Cost codes not recognised: <span className="font-mono">{result.unmatchedCodes.join(', ')}</span>. Add them under Cost codes,
              then recode those transactions.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[20rem] flex-1">
          <label htmlFor="i-project" className="label mb-1.5 block">
            Import into project
          </label>
          <select id="i-project" name="projectId" required className="field text-xs">
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[20rem] flex-1">
          <label htmlFor="i-file" className="label mb-1.5 block">
            Spreadsheet (.xlsx)
          </label>
          <input id="i-file" name="file" type="file" accept=".xlsx,.xlsm" required className="field text-xs" />
        </div>
        <Submit />
      </div>
    </form>
  )
}
