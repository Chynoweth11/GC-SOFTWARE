'use client'

import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? 'Signing in...' : 'Sign in'}
    </button>
  )
}

export function LoginForm({
  action,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>
  error?: string
}) {
  return (
    <form action={action} className="space-y-3.5">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="label mb-1.5 block">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="field"
          placeholder="you@constructx.com"
          defaultValue="owner@constructx.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="label mb-1.5 block">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
          defaultValue="constructx"
        />
      </div>

      <SubmitButton />
    </form>
  )
}
