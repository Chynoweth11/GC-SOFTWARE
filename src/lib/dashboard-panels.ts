/**
 * The dashboard's panels, and the user's arrangement of them.
 *
 * Which panels a user may see is decided by role, not by preference: hiding a
 * panel is a display choice and can never reveal one the role forbids. The
 * saved layout is filtered through the permitted set on every load, so a role
 * change takes effect immediately regardless of what was saved before.
 */

export interface PanelDefinition {
  id: string
  label: string
  description: string
}

export const DASHBOARD_PANELS: PanelDefinition[] = [
  { id: 'portfolio', label: 'Portfolio position', description: 'Contract value, backlog, revenue, profit and receivables' },
  { id: 'cost', label: 'Cost and cash position', description: 'Budget, actual, committed, EAC and cash' },
  { id: 'cashflow', label: 'Company cash flow', description: 'Collections against outflow with the cumulative curve' },
  { id: 'backlog', label: 'Backlog by project', description: 'Revenue still to be earned, largest first' },
  { id: 'revenue', label: 'Revenue and profit forecast', description: 'Monthly revenue, cost and gross profit' },
  { id: 'billing', label: 'Billing position', description: 'Over- and underbilling with the cash breakdown' },
  { id: 'alerts', label: 'Attention required', description: 'Live alerts across every project' },
  { id: 'projects', label: 'Projects', description: 'The portfolio table' },
  { id: 'pipeline', label: 'Bid pipeline', description: 'Open opportunities, weighted value and win rate' },
]

export const DEFAULT_PANEL_ORDER = DASHBOARD_PANELS.map((p) => p.id)

export interface DashboardLayout {
  order: string[]
  hidden: string[]
}

/**
 * Reconciles a stored layout against the panels this user is actually allowed
 * to see. Unknown ids are dropped and new panels appear at their natural
 * position, so shipping a new panel does not require resetting anyone's layout.
 */
export function resolveLayout(stored: string | null, permitted: string[]): DashboardLayout {
  let parsed: Partial<DashboardLayout> = {}
  if (stored) {
    try {
      parsed = JSON.parse(stored) as Partial<DashboardLayout>
    } catch {
      parsed = {}
    }
  }

  const allowed = new Set(permitted)
  const order = (parsed.order ?? []).filter((id) => allowed.has(id))
  const seen = new Set(order)

  // A panel the user has never seen is slotted in beside the neighbour it sits
  // after by default. Anchoring to a neighbour rather than to a numeric
  // position means a user who has reordered everything still gets the new panel
  // somewhere sensible instead of at the top.
  for (const id of DEFAULT_PANEL_ORDER) {
    if (!allowed.has(id) || seen.has(id)) continue

    const defaultIndex = DEFAULT_PANEL_ORDER.indexOf(id)
    let inserted = false
    for (let i = defaultIndex - 1; i >= 0; i--) {
      const anchor = DEFAULT_PANEL_ORDER[i]
      const at = order.indexOf(anchor)
      if (at >= 0) {
        order.splice(at + 1, 0, id)
        inserted = true
        break
      }
    }
    if (!inserted) order.unshift(id)
    seen.add(id)
  }

  return { order, hidden: (parsed.hidden ?? []).filter((id) => allowed.has(id)) }
}
