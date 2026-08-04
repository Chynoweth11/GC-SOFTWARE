'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchHit } from '@/lib/queries/search'

/**
 * Search across everything.
 *
 * Opens on the slash key from anywhere, matches as you type, and is driven
 * entirely from the keyboard: arrows move, Enter opens, Escape closes. Results
 * are grouped by what they are, because "26-001" meaning a project and "26-001"
 * meaning a change order on it are different answers to the same query.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)

  // Slash opens search from anywhere that is not already a text field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (event.key === '/' && !typing) {
        event.preventDefault()
        setOpen(true)
      }
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    setHits([])
    setActive(0)
  }

  const tooShort = query.trim().length < 2

  useEffect(() => {
    if (tooShort) return
    const id = ++requestId.current
    // Set inside the timer rather than in the effect body: the spinner should
    // appear when the request actually goes out, not on every keystroke.
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = (await response.json()) as { hits: SearchHit[] }
        // A slower earlier request must not overwrite a newer one.
        if (id === requestId.current) {
          setHits(data.hits ?? [])
          setActive(0)
        }
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [query, tooShort])

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>()
    for (const hit of tooShort ? [] : hits) {
      const list = map.get(hit.kind) ?? []
      list.push(hit)
      map.set(hit.kind, list)
    }
    return [...map.entries()]
  }, [hits, tooShort])

  const flat = useMemo(() => grouped.flatMap(([, list]) => list), [grouped])

  function goTo(hit: SearchHit | undefined) {
    if (!hit) return
    close()
    router.push(hit.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
        aria-label="Search everything"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left">Search projects, clients, vendors</span>
        <kbd
          className="rounded px-1 py-0.5 text-[10px] font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-subtle)' }}
        >
          /
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            className="mt-[8vh] w-full max-w-2xl overflow-hidden rounded-xl border shadow-2xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 border-b px-4" style={{ borderColor: 'var(--border)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth={2} aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActive((i) => Math.min(i + 1, flat.length - 1))
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActive((i) => Math.max(i - 1, 0))
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    goTo(flat[active])
                  }
                }}
                placeholder="Search projects, clients, vendors, estimates, invoices, reports"
                className="h-14 flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text)' }}
                aria-label="Search query"
              />
              {loading && !tooShort && (
                <span className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                  Searching
                </span>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {tooShort ? (
                <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
                  Type at least two characters. Try a job number, a client, a vendor or a report name.
                </p>
              ) : flat.length === 0 && !loading ? (
                <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
                  Nothing matches {query}.
                </p>
              ) : (
                grouped.map(([kind, list]) => (
                  <div key={kind}>
                    <div
                      className="sticky top-0 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                      style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
                    >
                      {kind}
                    </div>
                    {list.map((hit) => {
                      const index = flat.indexOf(hit)
                      const isActive = index === active
                      return (
                        <button
                          key={`${hit.kind}-${hit.href}-${hit.title}`}
                          type="button"
                          onMouseEnter={() => setActive(index)}
                          onClick={() => goTo(hit)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left"
                          style={{ background: isActive ? 'var(--accent-soft)' : 'transparent' }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium" style={{ color: 'var(--text)' }}>
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          {hit.detail && (
                            <span className="shrink-0 text-[11px] capitalize" style={{ color: 'var(--text-muted)' }}>
                              {hit.detail}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div
              className="flex items-center gap-3 border-t px-4 py-2 text-[10px]"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
            >
              <span>Up and down to move</span>
              <span>Enter to open</span>
              <span>Escape to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
