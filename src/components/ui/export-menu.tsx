'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Export control. One button rather than one per format, because every export
 * in this system offers the same two: the workbook you keep working in, and the
 * PDF you send to someone who will not.
 */
export function ExportMenu({
  excelHref,
  pdfHref,
  label = 'Export',
  size = 'default',
}: {
  excelHref: string
  pdfHref: string
  label?: string
  size?: 'default' | 'small'
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const sizeClass = size === 'small' ? 'text-xs' : ''

  return (
    <div ref={root} className="relative no-print">
      <button
        type="button"
        className={`btn btn-secondary ${sizeClass}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="ml-1.5">
          <path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <a
            role="menuitem"
            href={excelHref}
            className="block px-3 py-2 text-xs hover:opacity-80"
            style={{ color: 'var(--text)' }}
            onClick={() => setOpen(false)}
          >
            <span className="font-medium">Excel workbook</span>
            <span className="mt-0.5 block" style={{ color: 'var(--text-subtle)' }}>
              Every figure, still calculable
            </span>
          </a>
          <a
            role="menuitem"
            href={pdfHref}
            target="_blank"
            rel="noopener"
            className="block border-t px-3 py-2 text-xs hover:opacity-80"
            style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
            onClick={() => setOpen(false)}
          >
            <span className="font-medium">PDF</span>
            <span className="mt-0.5 block" style={{ color: 'var(--text-subtle)' }}>
              Formatted to send or file
            </span>
          </a>
          <button
            role="menuitem"
            type="button"
            className="block w-full border-t px-3 py-2 text-left text-xs hover:opacity-80"
            style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
            onClick={() => {
              setOpen(false)
              window.print()
            }}
          >
            <span className="font-medium">Print this page</span>
            <span className="mt-0.5 block" style={{ color: 'var(--text-subtle)' }}>
              Charts and all, as shown
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
