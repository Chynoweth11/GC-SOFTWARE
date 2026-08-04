'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DashboardLayout, PanelDefinition } from '@/lib/dashboard-panels'

/**
 * Dashboard arrangement.
 *
 * Order and visibility only: nothing here changes a figure, and a panel a
 * role cannot see never reaches this list in the first place.
 */
export function CustomizeDashboard({
  panels,
  layout,
  save,
}: {
  panels: PanelDefinition[]
  layout: DashboardLayout
  save: (formData: FormData) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [order, setOrder] = useState(layout.order)
  const [hidden, setHidden] = useState(new Set(layout.hidden))
  const [pending, setPending] = useState(false)

  const byId = new Map(panels.map((p) => [p.id, p]))

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
  }

  function toggle(id: string) {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHidden(next)
  }

  async function apply() {
    setPending(true)
    const formData = new FormData()
    formData.set('order', order.join(','))
    formData.set('hidden', [...hidden].join(','))
    await save(formData)
    setPending(false)
    setOpen(false)
    router.refresh()
  }

  function reset() {
    setOrder(panels.map((p) => p.id))
    setHidden(new Set())
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary no-print">
        Customize
      </button>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary no-print">
        Customize
      </button>
      <div
        className="fixed inset-0 z-40 flex items-start justify-end bg-black/30 p-4 no-print"
        role="dialog"
        aria-modal="true"
        aria-label="Customize dashboard"
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}
      >
        <div
          className="mt-16 w-full max-w-md overflow-hidden rounded-xl border shadow-xl"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Customize dashboard
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
              Reorder or hide panels. This changes your view only, and never what a figure says.
            </p>
          </div>

          <ul className="max-h-[26rem] overflow-y-auto">
            {order.map((id, index) => {
              const panel = byId.get(id)
              if (!panel) return null
              const isHidden = hidden.has(id)
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                  style={{ borderColor: 'var(--border)', opacity: isHidden ? 0.5 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={() => toggle(id)}
                    aria-label={`Show ${panel.label}`}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium" style={{ color: 'var(--text)' }}>
                      {panel.label}
                    </div>
                    <div className="truncate text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                      {panel.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${panel.label} up`}
                    className="btn btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    aria-label={`Move ${panel.label} down`}
                    className="btn btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={reset} className="btn btn-ghost text-xs">
              Reset to default
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost text-xs">
                Cancel
              </button>
              <button type="button" onClick={apply} disabled={pending} className="btn btn-primary text-xs">
                {pending ? 'Saving…' : 'Save layout'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
