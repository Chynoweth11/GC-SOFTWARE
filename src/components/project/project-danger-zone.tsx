'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Closing or deleting a job.
 *
 * Closing is the ordinary path and is reversible. Deleting is only offered when
 * the job carries no cost, billing or commitment history, and it asks for the
 * job number to be typed out, because there is no undo behind it.
 */
export function ProjectDangerZone({
  projectId,
  projectNumber,
  archived,
  canDelete,
  historyCount,
  setArchived,
  remove,
}: {
  projectId: string
  projectNumber: string
  archived: boolean
  canDelete: boolean
  historyCount: number
  setArchived: (formData: FormData) => Promise<{ error?: string }>
  remove: (formData: FormData) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const deletable = canDelete && historyCount === 0

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {archived ? 'This project is closed' : 'Close this project'}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {archived
              ? 'It stays in every report and keeps its full financial history. Reopen it to make changes again.'
              : 'Closing marks the job complete and keeps every figure, document and audit record exactly as it stands. This is the right way to retire a job.'}
          </p>
        </div>
        <form
          action={async (formData) => {
            setBusy(true)
            setError(null)
            const result = await setArchived(formData)
            setBusy(false)
            if (result?.error) setError(result.error)
            else router.refresh()
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="archived" value={String(!archived)} />
          <button type="submit" className="btn btn-secondary text-xs" disabled={busy}>
            {archived ? 'Reopen project' : 'Close project'}
          </button>
        </form>
      </div>

      {canDelete && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {!deletable ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-subtle)' }}>
              This project carries {historyCount} financial {historyCount === 1 ? 'record' : 'records'}, so it cannot be
              deleted. That history belongs to the company books. Close the project instead.
            </p>
          ) : !showDelete ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                This project has no cost, billing or commitment history, so it can still be deleted outright. The deletion
                itself is recorded permanently in the audit history.
              </p>
              <button type="button" className="btn btn-ghost text-xs" style={{ color: 'var(--adverse)' }} onClick={() => setShowDelete(true)}>
                Delete project
              </button>
            </div>
          ) : (
            <form
              action={async (formData) => {
                setBusy(true)
                setError(null)
                const result = await remove(formData)
                setBusy(false)
                if (result?.error) setError(result.error)
                else router.push('/projects')
              }}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--adverse)', background: 'var(--adverse-soft)' }}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <label htmlFor="delete-confirm" className="label mb-1.5 block" style={{ color: 'var(--adverse)' }}>
                Type {projectNumber} to confirm
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="delete-confirm"
                  name="confirmation"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="field h-8 max-w-[12rem] text-xs"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn text-xs"
                  style={{ background: 'var(--adverse)', color: '#fff', borderColor: 'var(--adverse)' }}
                  disabled={busy || confirmation !== projectNumber}
                >
                  {busy ? 'Deleting' : 'Delete permanently'}
                </button>
                <button type="button" className="btn btn-ghost text-xs" onClick={() => setShowDelete(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
