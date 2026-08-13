'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The annual unemployment notice, entered in one go.
 *
 * Fifty-one jurisdictions ship with no rate, because the rate is assigned to
 * each employer every year and a figure supplied with the software would be
 * wrong for most companies on the day it shipped. Without this, nobody could
 * compute a loaded labor rate until they had opened fifty-one forms.
 *
 * The box takes the notice as it is written: a state, then its rate, in
 * whatever order the states happen to be in. Anything it cannot read comes back
 * quoted in full, because a line that quietly failed to save is a labor cost
 * quietly priced light.
 */
export function RateImport({
  save,
  entered,
  total,
}: {
  save: (formData: FormData) => Promise<{ error?: string; applied?: number; skipped?: string[] }>
  entered: number
  total: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ applied: number; skipped: string[] } | null>(null)

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 no-print">
        <button type="button" className="btn btn-secondary text-xs" onClick={() => setOpen(true)}>
          Enter rates from a notice
        </button>
        <span className="text-xs" style={{ color: entered === 0 ? 'var(--caution)' : 'var(--text-subtle)' }}>
          {entered} of {total} states carry an unemployment rate
          {entered === 0 ? '. Until one does, labor cannot be loaded for that state.' : ''}
        </span>
      </div>
    )
  }

  return (
    <form
      action={async (formData) => {
        setBusy(true)
        setError(null)
        setResult(null)
        const outcome = await save(formData)
        setBusy(false)
        if (outcome?.error) {
          setError(outcome.error)
          setResult(outcome.skipped ? { applied: 0, skipped: outcome.skipped } : null)
          return
        }
        setResult({ applied: outcome.applied ?? 0, skipped: outcome.skipped ?? [] })
        router.refresh()
      }}
      className="rounded-lg border p-3 no-print"
      style={{ borderColor: 'var(--border-strong)' }}
    >
      {error && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {result && result.applied > 0 && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--favorable-soft)', borderColor: 'var(--favorable)', color: 'var(--favorable)' }}
          role="status"
        >
          {result.applied} {result.applied === 1 ? 'rate' : 'rates'} entered. Each one is unverified until somebody
          records that they checked it against the notice.
        </div>
      )}

      {result && result.skipped.length > 0 && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
          role="status"
        >
          <p className="font-medium">
            {result.skipped.length} {result.skipped.length === 1 ? 'line was' : 'lines were'} not read:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {result.skipped.slice(0, 8).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          One state and one rate to a line
        </span>
        <textarea
          name="rates"
          rows={7}
          required
          className="field mt-1 w-full font-mono text-xs"
          placeholder={'WA 1.43\nOregon, 2.1%\nCA\t3.4\nIdaho 0.97'}
        />
        <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          The two-letter code or the full name, then the rate as the notice writes it. Commas, tabs and per cent signs
          are all fine. A line starting with # is ignored.
        </span>
      </label>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Year these are for
          </span>
          <input name="sutaRateYear" placeholder="2026" className="field mt-1 w-28 text-sm" />
        </label>
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {busy ? 'Entering' : 'Enter the rates'}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => {
            setOpen(false)
            setResult(null)
            setError(null)
          }}
        >
          Done
        </button>
      </div>
    </form>
  )
}
