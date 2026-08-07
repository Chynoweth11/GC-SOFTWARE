'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DocumentForm } from './document-form'
import { Section } from '@/components/ui'

/**
 * The button that opens the form for a new document, and gets out of the way.
 *
 * Kept apart from the list so the page is a list of documents by default rather
 * than a form with a list under it.
 */
export function NewDocumentPanel({
  projectId,
  trades,
  save,
}: {
  projectId: string
  trades: { id: string; label: string }[]
  save: (formData: FormData) => Promise<{ error?: string; id?: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="flex justify-end no-print">
        <button type="button" className="btn btn-secondary text-xs" onClick={() => setOpen(true)}>
          Raise a change order or record a contract
        </button>
      </div>
    )
  }

  return (
    <Section title="New document">
      <div className="card p-4">
        <DocumentForm
          projectId={projectId}
          trades={trades}
          save={save}
          onCancel={() => setOpen(false)}
          onDone={(id) => {
            setOpen(false)
            // Straight into the breakdown, because a new document has no lines
            // yet and pricing it is the next thing anybody wants to do.
            if (id) router.push(`/projects/${projectId}/changes/${id}`)
          }}
        />
      </div>
    </Section>
  )
}
