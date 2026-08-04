'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A destructive action behind one deliberate confirmation.
 *
 * Deleting a financial record is worth a pause, and the dialog says what will
 * actually happen rather than asking "are you sure". Escape and a click outside
 * both cancel, so the safe outcome is always the easy one.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  title,
  description,
  onConfirm,
  tone = 'adverse',
  disabled,
  size = 'small',
}: {
  label: string
  confirmLabel?: string
  title: string
  description: string
  onConfirm: () => Promise<void> | void
  tone?: 'adverse' | 'caution'
  disabled?: boolean
  size?: 'small' | 'default'
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const accent = tone === 'adverse' ? 'var(--adverse)' : 'var(--caution)'

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost ${size === 'small' ? 'text-xs' : ''}`}
        style={{ color: accent }}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border shadow-xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="px-4 pb-3 pt-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {description}
              </p>
            </div>
            <div
              className="flex items-center justify-end gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)' }}
            >
              <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="btn text-xs"
                style={{ background: accent, color: '#fff', borderColor: accent }}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await onConfirm()
                    setOpen(false)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? 'Working' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
