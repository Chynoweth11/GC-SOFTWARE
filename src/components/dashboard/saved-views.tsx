'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SavedViewRow } from '@/lib/queries/views'

/**
 * Saved filter combinations.
 *
 * The view stores the query string, so applying one is a navigation: every
 * figure is recomputed by the page it lands on. There is no cached result to
 * go stale and no second copy of the filter logic.
 */
export function SavedViews({
  scope,
  views,
  save,
  remove,
}: {
  scope: string
  views: SavedViewRow[]
  save: (formData: FormData) => Promise<{ error?: string }>
  remove: (formData: FormData) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [naming, setNaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const currentQuery = searchParams.toString()
  const activeView = views.find((v) => v.query === currentQuery)
  const hasFilters = currentQuery.length > 0

  function apply(query: string) {
    router.push(query ? `?${query}` : '?')
  }

  async function onSave(formData: FormData) {
    setPending(true)
    setError(null)
    formData.set('scope', scope)
    formData.set('query', currentQuery)
    const result = await save(formData)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNaming(false)
    router.refresh()
  }

  async function onDelete(id: string) {
    setPending(true)
    const formData = new FormData()
    formData.set('id', id)
    const result = await remove(formData)
    setPending(false)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
      <span className="label">Views</span>

      <button
        type="button"
        onClick={() => apply('')}
        className={`pill transition-colors ${!hasFilters ? '' : 'hover:opacity-80'}`}
        style={{
          background: !hasFilters ? 'var(--accent-soft)' : 'var(--surface-inset)',
          color: !hasFilters ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        Everything
      </button>

      {views.map((view) => {
        const active = activeView?.id === view.id
        return (
          <span key={view.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => apply(view.query)}
              className="pill transition-colors hover:opacity-80"
              style={{
                background: active ? 'var(--accent-soft)' : 'var(--surface-inset)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
              }}
              title={view.shared ? `Shared by ${view.ownedByViewer ? 'you' : 'a colleague'}` : 'Only you can see this view'}
            >
              {view.name}
              {view.isDefault && <span aria-label="Default view"> ★</span>}
              {view.shared && !view.ownedByViewer && <span aria-label="Shared with you"> ·</span>}
            </button>
            {view.ownedByViewer && (
              <button
                type="button"
                onClick={() => onDelete(view.id)}
                disabled={pending}
                aria-label={`Delete the ${view.name} view`}
                className="ml-0.5 px-1 text-xs leading-none hover:opacity-70"
                style={{ color: 'var(--text-subtle)' }}
              >
                ×
              </button>
            )}
          </span>
        )
      })}

      {naming ? (
        <form action={onSave} className="flex items-center gap-2">
          <input
            name="name"
            autoFocus
            required
            maxLength={60}
            placeholder="Name this view"
            className="field h-7 w-44 text-xs"
            defaultValue={activeView?.name ?? ''}
          />
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" name="shared" defaultChecked={activeView?.shared} /> Share
          </label>
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" name="isDefault" defaultChecked={activeView?.isDefault} /> Default
          </label>
          <button type="submit" disabled={pending} className="btn btn-primary text-xs">
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setNaming(false)} className="btn btn-ghost text-xs">
            Cancel
          </button>
        </form>
      ) : (
        hasFilters && (
          <button type="button" onClick={() => setNaming(true)} className="btn btn-ghost text-xs">
            {activeView ? 'Update this view' : 'Save these filters'}
          </button>
        )
      )}

      {error && (
        <span className="text-xs" style={{ color: 'var(--adverse)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
