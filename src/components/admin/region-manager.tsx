'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'

export interface RegionNode {
  id: string
  name: string
  notes: string | null
  vendorCount: number
}

export interface StateNode {
  id: string
  name: string
  code: string | null
  vendorCount: number
  regions: RegionNode[]
}

/**
 * States and their regions.
 *
 * Presented as the nested list it actually is, so the shape of the territory is
 * obvious at a glance and a region is always created inside a named state.
 */
export function RegionManager({
  states,
  saveState,
  removeState,
  saveRegion,
  removeRegion,
}: {
  states: StateNode[]
  saveState: (formData: FormData) => Promise<{ error?: string }>
  removeState: (formData: FormData) => Promise<{ error?: string }>
  saveRegion: (formData: FormData) => Promise<{ error?: string }>
  removeRegion: (formData: FormData) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingState, setEditingState] = useState<string | null>(null)
  const [editingRegion, setEditingRegion] = useState<string | null>(null)
  const [addingRegionTo, setAddingRegionTo] = useState<string | null>(null)
  const [addingState, setAddingState] = useState(false)

  async function run(action: (fd: FormData) => Promise<{ error?: string }>, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  return (
    <div>
      {error && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        {states.map((state) => (
          <div key={state.id} className="card overflow-hidden">
            <div
              className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)' }}
            >
              {editingState === state.id ? (
                <form
                  action={async (formData) => {
                    if (await run(saveState, formData)) setEditingState(null)
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="id" value={state.id} />
                  <input name="name" defaultValue={state.name} required className="field h-7 w-48 text-xs" aria-label="State name" />
                  <input name="code" defaultValue={state.code ?? ''} maxLength={2} placeholder="WA" className="field h-7 w-16 text-xs" aria-label="State code" />
                  <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditingState(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {state.name}
                  </h3>
                  {state.code && (
                    <span className="pill" style={{ background: 'var(--surface)', color: 'var(--text-subtle)' }}>
                      {state.code}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {state.regions.length} region{state.regions.length === 1 ? '' : 's'}, {state.vendorCount} vendor
                    {state.vendorCount === 1 ? '' : 's'}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" className="btn btn-ghost text-xs" onClick={() => setAddingRegionTo(state.id)}>
                      Add region
                    </button>
                    <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditingState(state.id)}>
                      Rename
                    </button>
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Delete state"
                      title={`Delete ${state.name}`}
                      description={
                        state.vendorCount > 0
                          ? `${state.name} still has ${state.vendorCount} vendors assigned. Move them out first or this will be refused.`
                          : `This removes ${state.name} and its ${state.regions.length} regions. The deletion is recorded permanently in the audit history.`
                      }
                      onConfirm={async () => {
                        const formData = new FormData()
                        formData.set('id', state.id)
                        await run(removeState, formData)
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="px-4 py-3">
              {addingRegionTo === state.id && (
                <form
                  action={async (formData) => {
                    if (await run(saveRegion, formData)) setAddingRegionTo(null)
                  }}
                  className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border p-2.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <input type="hidden" name="stateId" value={state.id} />
                  <div>
                    <label htmlFor={`region-name-${state.id}`} className="label mb-1 block">
                      Region name
                    </label>
                    <input id={`region-name-${state.id}`} name="name" required placeholder="Tri-Cities" className="field h-7 w-56 text-xs" />
                  </div>
                  <div className="flex-1">
                    <label htmlFor={`region-notes-${state.id}`} className="label mb-1 block">
                      Note
                    </label>
                    <input id={`region-notes-${state.id}`} name="notes" placeholder="Optional" className="field h-7 text-xs" />
                  </div>
                  <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                    Add region
                  </button>
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setAddingRegionTo(null)}>
                    Cancel
                  </button>
                </form>
              )}

              {state.regions.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  No regions yet. Add the working areas you use for this state.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {state.regions.map((region) => (
                    <li
                      key={region.id}
                      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {editingRegion === region.id ? (
                        <form
                          action={async (formData) => {
                            if (await run(saveRegion, formData)) setEditingRegion(null)
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input type="hidden" name="id" value={region.id} />
                          <input type="hidden" name="stateId" value={state.id} />
                          <input name="name" defaultValue={region.name} required className="field h-7 w-48 text-xs" aria-label="Region name" />
                          <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                            Save
                          </button>
                          <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditingRegion(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                            {region.name}
                          </span>
                          <span className="tnum text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                            {region.vendorCount}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost px-1 py-0 text-[11px]"
                            onClick={() => setEditingRegion(region.id)}
                            aria-label={`Rename ${region.name}`}
                          >
                            Rename
                          </button>
                          <ConfirmButton
                            label="Delete"
                            confirmLabel="Delete region"
                            title={`Delete ${region.name}`}
                            description={
                              region.vendorCount > 0
                                ? `${region.name} still has ${region.vendorCount} vendors in it. Move them out first or this will be refused.`
                                : 'This region has no vendors in it. The deletion is recorded permanently in the audit history.'
                            }
                            onConfirm={async () => {
                              const formData = new FormData()
                              formData.set('id', region.id)
                              await run(removeRegion, formData)
                            }}
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {addingState ? (
        <form
          action={async (formData) => {
            if (await run(saveState, formData)) setAddingState(false)
          }}
          className="card mt-3 flex flex-wrap items-end gap-2 p-3"
        >
          <div>
            <label htmlFor="new-state-name" className="label mb-1 block">
              State name
            </label>
            <input id="new-state-name" name="name" required placeholder="Washington" className="field h-8 w-56 text-xs" />
          </div>
          <div>
            <label htmlFor="new-state-code" className="label mb-1 block">
              Code
            </label>
            <input id="new-state-code" name="code" maxLength={2} placeholder="WA" className="field h-8 w-20 text-xs" />
          </div>
          <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
            Add state
          </button>
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setAddingState(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary mt-3 text-xs" onClick={() => setAddingState(true)}>
          Add state
        </button>
      )}
    </div>
  )
}
