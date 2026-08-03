import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Saved views and interface preferences.
 *
 * A saved view stores a query string, never a result. Opening one re-runs the
 * same calculation the live page runs, so a view saved six months ago shows
 * today's figures rather than a snapshot that has quietly gone stale.
 */

export interface SavedViewRow {
  id: string
  name: string
  query: string
  isDefault: boolean
  shared: boolean
  ownedByViewer: boolean
}

export async function listSavedViews(
  scope: string,
  user: { id: string; companyId: string },
): Promise<SavedViewRow[]> {
  const views = await prisma.savedView.findMany({
    where: {
      scope,
      OR: [{ userId: user.id }, { companyId: user.companyId, shared: true }],
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return views.map((v) => ({
    id: v.id,
    name: v.name,
    query: v.query,
    isDefault: v.isDefault,
    shared: v.shared,
    ownedByViewer: v.userId === user.id,
  }))
}

/** The view loaded when no filters are in the URL. Only the viewer's own counts. */
export async function defaultSavedView(scope: string, userId: string): Promise<SavedViewRow | null> {
  const view = await prisma.savedView.findFirst({ where: { scope, userId, isDefault: true } })
  if (!view) return null
  return {
    id: view.id,
    name: view.name,
    query: view.query,
    isDefault: view.isDefault,
    shared: view.shared,
    ownedByViewer: true,
  }
}

// ── Interface preferences ─────────────────────────────────────────────────

export async function getPreference(userId: string, key: string): Promise<string | null> {
  const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } } })
  return row?.value ?? null
}

export async function setPreference(userId: string, key: string, value: string): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value },
    update: { value },
  })
}
