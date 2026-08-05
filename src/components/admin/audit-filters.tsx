'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { titleize } from '@/lib/format'

/**
 * Filters for the audit history.
 *
 * They read and write the query string, so a filtered view can be linked to,
 * bookmarked and exported. Nothing here mutates a record.
 */
export function AuditFilters({
  entities,
  actions,
  users,
}: {
  entities: string[]
  actions: string[]
  users: { id: string; label: string }[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.push(next.toString() ? `/admin/audit?${next.toString()}` : '/admin/audit')
  }

  const value = (key: string) => params.get(key) ?? ''
  const hasFilters = [...params.keys()].some((k) => k !== 'page')

  return (
    <form
      className="card flex flex-wrap items-end gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const input = new FormData(event.currentTarget).get('q')
        apply('q', String(input ?? ''))
      }}
    >
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="audit-q" className="label mb-1.5 block">
          Search
        </label>
        <input
          id="audit-q"
          name="q"
          key={value('q')}
          defaultValue={value('q')}
          placeholder="Record, field, value or person"
          className="field h-8 text-xs"
          // Applies on Enter, and also when the field is left. Typing a phrase
          // and then clicking a dropdown used to discard it silently.
          onBlur={(event) => {
            if (value('q') !== event.target.value.trim()) apply('q', event.target.value.trim())
          }}
        />
      </div>

      <div>
        <label htmlFor="audit-entity" className="label mb-1.5 block">
          Record type
        </label>
        <select id="audit-entity" className="field h-8 text-xs" value={value('entity')} onChange={(e) => apply('entity', e.target.value)}>
          <option value="">All types</option>
          {entities.map((entity) => (
            <option key={entity} value={entity}>
              {entity}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="audit-action" className="label mb-1.5 block">
          Action
        </label>
        <select id="audit-action" className="field h-8 text-xs" value={value('action')} onChange={(e) => apply('action', e.target.value)}>
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {titleize(action)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="audit-user" className="label mb-1.5 block">
          Person
        </label>
        <select id="audit-user" className="field h-8 text-xs" value={value('user')} onChange={(e) => apply('user', e.target.value)}>
          <option value="">Everyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="audit-from" className="label mb-1.5 block">
          From
        </label>
        <input id="audit-from" type="date" className="field h-8 text-xs" value={value('from')} onChange={(e) => apply('from', e.target.value)} />
      </div>

      <div>
        <label htmlFor="audit-to" className="label mb-1.5 block">
          To
        </label>
        <input id="audit-to" type="date" className="field h-8 text-xs" value={value('to')} onChange={(e) => apply('to', e.target.value)} />
      </div>

      <button type="submit" className="btn btn-secondary text-xs">
        Search
      </button>
      {hasFilters && (
        <button type="button" className="btn btn-ghost text-xs" onClick={() => router.push('/admin/audit')}>
          Clear
        </button>
      )}
    </form>
  )
}
