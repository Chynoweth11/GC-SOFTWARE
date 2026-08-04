'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProjectSearchGroup } from '@/lib/queries/search'

/**
 * Search inside one job.
 *
 * Looks across budget lines, costs, commitments, change orders, pay
 * applications, subcontractor invoices and quantities at once, so a manager
 * hunting a number does not have to remember which tab it lives on.
 */
export function ProjectSearch({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<ProjectSearchGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const tooShort = query.trim().length < 2

  useEffect(() => {
    if (tooShort) return
    const id = ++requestId.current
    // Set inside the timer rather than in the effect body: the spinner should
    // appear when the request actually goes out, not on every keystroke.
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search/project?project=${projectId}&q=${encodeURIComponent(query)}`)
        const data = (await response.json()) as { groups: ProjectSearchGroup[] }
        if (id === requestId.current) {
          setGroups(data.groups ?? [])
          setOpen(true)
        }
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [query, projectId, tooShort])

  const visible = tooShort ? [] : groups
  const total = visible.reduce((n, g) => n + g.hits.length, 0)

  return (
    <div ref={root} className="relative w-full max-w-sm no-print">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => !tooShort && setOpen(true)}
        placeholder="Search this project"
        className="field h-8 text-xs"
        aria-label="Search within this project"
      />

      {open && !tooShort && (
        <div
          className="absolute right-0 top-9 z-40 max-h-[26rem] w-[26rem] overflow-y-auto rounded-xl border shadow-xl"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {total === 0 ? (
            <p className="px-4 py-5 text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
              {loading ? 'Searching' : `Nothing in this project matches ${query}.`}
            </p>
          ) : (
            visible.map((group) => (
              <div key={group.kind}>
                <div
                  className="sticky top-0 flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
                >
                  <span>{group.kind}</span>
                  <span>{group.hits.length}</span>
                </div>
                {group.hits.map((hit, index) => (
                  <button
                    key={`${group.kind}-${index}`}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      router.push(hit.href)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--accent-soft)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs" style={{ color: 'var(--text)' }}>
                        {hit.title}
                      </span>
                      {hit.subtitle && (
                        <span className="block truncate text-[11px] capitalize" style={{ color: 'var(--text-subtle)' }}>
                          {hit.subtitle}
                        </span>
                      )}
                    </span>
                    {hit.detail && (
                      <span className="tnum shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {hit.detail}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
