'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { RestoreResult } from '@/lib/backup'

/**
 * Restore a project from a backup file.
 *
 * A restore always creates a new project and never writes over a live one, so
 * the worst outcome of a wrong file is a duplicate to delete rather than a month
 * of budgets and billings overwritten.
 */
export function RestoreForm({
  action,
}: {
  action: (prev: RestoreResult | null, formData: FormData) => Promise<RestoreResult>
}) {
  const [result, submit, pending] = useActionState(action, null)

  return (
    <div className="space-y-4">
      <form action={submit} className="card space-y-3 p-4">
        <div>
          <label htmlFor="backup" className="label mb-1.5 block">
            Backup file
          </label>
          <input id="backup" name="backup" type="file" accept="application/json,.json" required className="field text-xs" />
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            A <code>.json</code> file taken from a project&apos;s settings tab. The restore always creates a new project; nothing
            existing is overwritten. If the job number is already in use, a suffix is added and you will be told.
          </p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Restoring...' : 'Restore project'}
        </button>
      </form>

      {result?.error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
        >
          {result.error}
        </div>
      )}

      {result && !result.error && result.projectId && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--favorable)' }}>
            Restored as {result.number}
          </h3>
          <div className="table-wrap mt-3">
            <table className="data">
              <thead>
                <tr>
                  <th>Record type</th>
                  <th className="num">Created</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.created).map(([key, count]) => (
                  <tr key={key}>
                    <td>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</td>
                    <td className="num">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs" style={{ color: 'var(--caution)' }}>
              {result.warnings.map((warning, index) => (
                <li key={index}>· {warning}</li>
              ))}
            </ul>
          )}

          <Link href={`/projects/${result.projectId}`} className="btn btn-primary mt-3 text-xs">
            Open {result.number} →
          </Link>
        </div>
      )}
    </div>
  )
}
