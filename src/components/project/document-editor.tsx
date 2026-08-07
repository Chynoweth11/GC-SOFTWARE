'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DocumentForm, type DocumentDefaults } from './document-form'

/** Opens the document form on an existing record, and closes it again. */
export function DocumentEditor({
  projectId,
  defaults,
  trades,
  save,
}: {
  projectId: string
  defaults: DocumentDefaults
  trades: { id: string; label: string }[]
  save: (formData: FormData) => Promise<{ error?: string; id?: string }>
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost text-xs no-print" onClick={() => setOpen(true)}>
        Edit this document
      </button>
    )
  }

  return (
    <div className="card p-4">
      <DocumentForm
        projectId={projectId}
        defaults={defaults}
        trades={trades}
        save={save}
        onCancel={() => setOpen(false)}
        onDone={() => setOpen(false)}
      />
    </div>
  )
}

/**
 * Deletes a document, which is only ever allowed while it is unapproved.
 *
 * An approved one carries money in the contract value and the budget, so the
 * server refuses it outright and the button says so rather than failing after
 * the click.
 */
export function DeleteDocumentButton({
  projectId,
  documentId,
  documentNumber,
  approved,
  remove,
}: {
  projectId: string
  documentId: string
  documentNumber: string
  approved: boolean
  remove: (formData: FormData) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (approved) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
        An approved document cannot be deleted. Withdraw the approval first.
      </span>
    )
  }

  return (
    <>
      <button type="button" className="btn btn-ghost text-xs no-print" onClick={() => setAsking(true)}>
        Delete this document
      </button>

      {asking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'color-mix(in oklab, black 55%, transparent)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Delete this document"
        >
          <div
            className="w-full max-w-md rounded-xl border p-5"
            style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}
          >
            <h2 className="text-sm font-semibold" style={{ color: 'var(--adverse)' }}>
              Delete {documentNumber}
            </h2>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              This removes the document and everything priced on it. The deletion is recorded permanently in the audit
              history, but the document itself will be gone.
            </p>

            {error && (
              <div
                className="mt-3 rounded-lg border px-3 py-2 text-xs"
                style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-ghost text-xs" onClick={() => setAsking(false)}>
                No, keep it
              </button>
              <button
                type="button"
                className="btn btn-danger text-xs"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  const formData = new FormData()
                  formData.set('id', documentId)
                  const result = await remove(formData)
                  setBusy(false)
                  if (result?.error) {
                    setError(result.error)
                    return
                  }
                  router.push(`/projects/${projectId}/changes`)
                  router.refresh()
                }}
              >
                Delete the document
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
