'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Adding…' : 'Add user'}
    </button>
  )
}

export function UserForm({
  action,
  roles,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>
  roles: { value: string; label: string }[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={async (formData) => {
        setError(null)
        setSaved(false)
        const result = await action(formData)
        if (result?.error) setError(result.error)
        else setSaved(true)
      }}
      className="card flex flex-wrap items-end gap-3 p-4"
    >
      {error && (
        <div className="w-full rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div
          className="w-full rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 40%, transparent)', color: 'var(--favorable)' }}
          role="status"
        >
          User added. They can sign in with the password you set.
        </div>
      )}

      <div>
        <label htmlFor="u-name" className="label mb-1.5 block">Name</label>
        <input id="u-name" name="name" required className="field w-48 text-xs" />
      </div>
      <div>
        <label htmlFor="u-email" className="label mb-1.5 block">Email</label>
        <input id="u-email" name="email" type="email" required className="field w-56 text-xs" />
      </div>
      <div>
        <label htmlFor="u-role" className="label mb-1.5 block">Role</label>
        <select id="u-role" name="role" className="field w-48 text-xs" defaultValue="READ_ONLY">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="u-password" className="label mb-1.5 block">Initial password</label>
        <input id="u-password" name="password" type="password" required minLength={8} className="field w-48 text-xs" placeholder="At least 8 characters" />
      </div>
      <Submit />
    </form>
  )
}
