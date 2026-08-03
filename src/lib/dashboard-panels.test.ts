import { describe, expect, it } from 'vitest'
import { DEFAULT_PANEL_ORDER, resolveLayout } from './dashboard-panels'

const ALL = DEFAULT_PANEL_ORDER

describe('dashboard layout', () => {
  it('falls back to the default order when nothing is stored', () => {
    expect(resolveLayout(null, ALL)).toEqual({ order: ALL, hidden: [] })
  })

  it('survives a corrupt preference rather than throwing', () => {
    expect(resolveLayout('not json at all', ALL).order).toEqual(ALL)
    expect(resolveLayout('[]', ALL).order).toEqual(ALL)
  })

  it('honours a saved order', () => {
    const stored = JSON.stringify({ order: ['projects', 'portfolio', 'cost'], hidden: [] })
    const layout = resolveLayout(stored, ['portfolio', 'cost', 'projects'])
    expect(layout.order).toEqual(['projects', 'portfolio', 'cost'])
  })

  it('drops panels the role is not permitted to see, however the layout was saved', () => {
    const stored = JSON.stringify({ order: ['cashflow', 'portfolio'], hidden: ['cashflow'] })
    const layout = resolveLayout(stored, ['portfolio', 'cost'])
    expect(layout.order).not.toContain('cashflow')
    expect(layout.hidden).not.toContain('cashflow')
  })

  it('ignores ids that no longer exist', () => {
    const stored = JSON.stringify({ order: ['portfolio', 'a-panel-we-deleted'], hidden: [] })
    expect(resolveLayout(stored, ALL).order).not.toContain('a-panel-we-deleted')
  })

  it('places a newly shipped panel at its natural position instead of dropping it', () => {
    // A layout saved before "backlog" existed still has to show it.
    const withoutBacklog = ALL.filter((id) => id !== 'backlog')
    const layout = resolveLayout(JSON.stringify({ order: withoutBacklog, hidden: [] }), ALL)
    expect(layout.order).toHaveLength(ALL.length)
    expect(layout.order).toEqual(ALL)
  })

  it('keeps a new panel adjacent to its default neighbour even when the rest is reordered', () => {
    const reordered = ['projects', 'portfolio', 'cashflow']
    const permitted = ['projects', 'portfolio', 'cashflow', 'backlog']
    const layout = resolveLayout(JSON.stringify({ order: reordered, hidden: [] }), permitted)
    expect(layout.order).toHaveLength(4)
    expect(layout.order).toContain('backlog')
    // backlog follows cashflow by default, so it must not jump ahead of it.
    expect(layout.order.indexOf('backlog')).toBeGreaterThan(layout.order.indexOf('cashflow'))
  })

  it('never returns a hidden panel that is not also in the order', () => {
    const layout = resolveLayout(JSON.stringify({ order: ALL, hidden: ['projects'] }), ALL)
    for (const id of layout.hidden) expect(layout.order).toContain(id)
  })
})
