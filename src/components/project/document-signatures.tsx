'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Pill } from '@/components/ui'
import { date, dateInput } from '@/lib/format'

/**
 * Who has to sign, who has signed, and when.
 *
 * Signing is recorded here; approving is a separate act on the document. They
 * are apart on purpose: everyone can have signed and the money still does not
 * move until somebody in this company certifies that the signed copy is the
 * one in front of them. The engine will not let an approval through while any
 * party on this list is still awaiting.
 */

export interface SignatureRow {
  id: string
  party: string
  role: string | null
  email: string | null
  status: string
  signedAt: string | null
  note: string | null
}

export interface AttachmentRow {
  id: string
  kind: string
  fileName: string
  location: string | null
  note: string | null
  uploadedByName: string | null
  createdAt: string
  /** Set when this system holds the file, rather than pointing at one. */
  stored: boolean
  byteSize: number | null
  /** First twelve characters of the SHA-256, which is enough to compare by eye. */
  checksumShort: string | null
}

/** File sizes the way a person reads them. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const SIGNATURE_STATUSES: [string, string][] = [
  ['AWAITING', 'Awaiting'],
  ['SIGNED', 'Signed'],
  ['DECLINED', 'Declined'],
]

const ATTACHMENT_KINDS: [string, string][] = [
  ['SIGNED_DOCUMENT', 'Signed document'],
  ['UNSIGNED_DOCUMENT', 'Unsigned document'],
  ['PRICING_BACKUP', 'Pricing backup'],
  ['SUBCONTRACTOR_QUOTE', 'Subcontractor quote'],
  ['CORRESPONDENCE', 'Correspondence'],
  ['OTHER', 'Other'],
]

export function DocumentSignatures({
  documentId,
  rows,
  canEdit,
  locked,
  save,
  remove,
}: {
  documentId: string
  rows: SignatureRow[]
  canEdit: boolean
  locked: boolean
  save: Action
  remove: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function run(action: Action, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  const editable = canEdit && !locked

  return (
    <div className="space-y-3">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          No signing parties recorded. Add each one and the document cannot be approved until all of them have signed.
        </p>
      ) : (
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Role</th>
                  <th>Where they stand</th>
                  <th>Signed</th>
                  <th>Note</th>
                  {editable && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editing === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={editable ? 6 : 5} className="top">
                        <SignatureForm
                          documentId={documentId}
                          row={row}
                          busy={busy}
                          onCancel={() => setEditing(null)}
                          onSubmit={async (formData) => {
                            if (await run(save, formData)) setEditing(null)
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td className="font-medium">
                        {row.party}
                        {row.email && (
                          <div className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                            {row.email}
                          </div>
                        )}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.role ?? ''}
                      </td>
                      <td>
                        <Pill
                          tone={row.status === 'SIGNED' ? 'favorable' : row.status === 'DECLINED' ? 'adverse' : 'caution'}
                          dot
                        >
                          {SIGNATURE_STATUSES.find(([value]) => value === row.status)?.[1] ?? row.status}
                        </Pill>
                      </td>
                      <td>{row.signedAt ? date(row.signedAt) : ''}</td>
                      <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.note ?? ''}
                      </td>
                      {editable && (
                        <td className="no-print">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                              Edit
                            </button>
                            <ConfirmButton
                              label="Remove"
                              confirmLabel="Remove the party"
                              title={`Remove ${row.party}`}
                              description="The removal is recorded permanently in the audit history."
                              onConfirm={async () => {
                                const formData = new FormData()
                                formData.set('id', row.id)
                                await run(remove, formData)
                              }}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && editable && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
          <SignatureForm
            documentId={documentId}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSubmit={async (formData) => {
              if (await run(save, formData)) setAdding(false)
            }}
          />
        </div>
      )}

      {editable && !adding && (
        <div className="no-print">
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setAdding(true)}>
            Add a signing party
          </button>
        </div>
      )}
    </div>
  )
}

function SignatureForm({
  documentId,
  row,
  busy,
  onSubmit,
  onCancel,
}: {
  documentId: string
  row?: SignatureRow
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [status, setStatus] = useState(row?.status ?? 'AWAITING')

  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="documentId" value={documentId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Party
          </span>
          <input name="party" defaultValue={row?.party ?? ''} required className="field mt-1 w-full text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Role
          </span>
          <input
            name="role"
            defaultValue={row?.role ?? ''}
            placeholder="Owner, architect, contractor"
            className="field mt-1 w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Email
          </span>
          <input name="email" defaultValue={row?.email ?? ''} className="field mt-1 w-full text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Where they stand
          </span>
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="field mt-1 w-full text-sm"
          >
            {SIGNATURE_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Signed on
          </span>
          <input
            type="date"
            name="signedAt"
            defaultValue={row?.signedAt ? dateInput(row.signedAt) : ''}
            disabled={status !== 'SIGNED'}
            className="field mt-1 w-full text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Note
        </span>
        <input name="note" defaultValue={row?.note ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save party' : 'Add the party'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * The financial records behind the document, the signed copy above all.
 *
 * Filenames and locations rather than a document library, which is deliberate:
 * this system carries financial records, and drawings and specifications belong
 * where the field already keeps them.
 */
export function DocumentAttachments({
  documentId,
  rows,
  canEdit,
  save,
  remove,
}: {
  documentId: string
  rows: AttachmentRow[]
  canEdit: boolean
  save: Action
  remove: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  async function run(action: Action, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          Nothing attached. The signed copy belongs here, so the approval can be produced later.
        </p>
      ) : (
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>File</th>
                  <th>What it is</th>
                  <th>Held here</th>
                  <th>Where it lives</th>
                  <th>Added</th>
                  <th>By</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">
                      {row.stored ? (
                        <a
                          href={`/api/attachment/${row.id}`}
                          className="hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          {row.fileName}
                        </a>
                      ) : (
                        row.fileName
                      )}
                      {row.note && (
                        <div className="wrap text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          {row.note}
                        </div>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {ATTACHMENT_KINDS.find(([value]) => value === row.kind)?.[1] ?? row.kind}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.stored ? (
                        <>
                          {row.byteSize !== null ? fileSize(row.byteSize) : 'Yes'}
                          {row.checksumShort && (
                            <div
                              className="text-[10px]"
                              style={{ color: 'var(--text-subtle)' }}
                              title="SHA-256 of the file as it was filed. Checked again on every download."
                            >
                              {row.checksumShort}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--caution)' }}>Reference only</span>
                      )}
                    </td>
                    <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.location ?? ''}
                    </td>
                    <td>{date(row.createdAt)}</td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.uploadedByName ?? ''}
                    </td>
                    {canEdit && (
                      <td className="no-print">
                        <div className="flex justify-end">
                          <ConfirmButton
                            label="Remove"
                            confirmLabel="Remove the record"
                            title={`Remove ${row.fileName}`}
                            description="The removal is recorded permanently in the audit history."
                            onConfirm={async () => {
                              const formData = new FormData()
                              formData.set('id', row.id)
                              await run(remove, formData)
                            }}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && canEdit && (
        <form
          action={async (formData) => {
            if (await run(save, formData)) setAdding(false)
          }}
          className="rounded-lg border p-3"
          style={{ borderColor: 'var(--border-strong)' }}
        >
          <input type="hidden" name="documentId" value={documentId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block lg:col-span-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                The file
              </span>
              <input
                type="file"
                name="file"
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.xlsx,.docx,.csv"
                className="field mt-1 w-full text-sm"
                onChange={(event) => {
                  // Name the record after the file, unless somebody has already
                  // typed a name of their own.
                  const chosen = event.target.files?.[0]
                  const form = event.target.form
                  const nameField = form?.elements.namedItem('fileName') as HTMLInputElement | null
                  if (chosen && nameField && !nameField.value) nameField.value = chosen.name
                }}
              />
              <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                Held here and hashed, so it can be produced later and proved unchanged. Up to 25 MB. Leave it empty to
                record a file kept somewhere else.
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                File name
              </span>
              <input name="fileName" required className="field mt-1 w-full text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                What it is
              </span>
              <select name="kind" defaultValue="SIGNED_DOCUMENT" className="field mt-1 w-full text-sm">
                {ATTACHMENT_KINDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Where it lives
              </span>
              <input name="location" placeholder="A path or a link" className="field mt-1 w-full text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Note
              </span>
              <input name="note" className="field mt-1 w-full text-sm" />
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
              Attach it
            </button>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {canEdit && !adding && (
        <div className="no-print">
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setAdding(true)}>
            Attach a record
          </button>
        </div>
      )}
    </div>
  )
}
