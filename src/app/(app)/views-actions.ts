'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { setPreference } from '@/lib/queries/views'

/**
 * Saved views and dashboard layout.
 *
 * Both are interface state, so they carry no permission check beyond being
 * signed in: a saved view is a query string, and running it goes through the
 * same role filtering every other page request does. Nothing here can widen
 * what a user is allowed to see.
 */

const MAX_NAME = 60

function normaliseQuery(raw: string): string {
  const trimmed = raw.trim().replace(/^\?/, '')
  if (!trimmed) return ''
  // Rebuild through URLSearchParams so nothing but key/value pairs survives.
  return new URLSearchParams(trimmed).toString()
}

export async function saveView(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()

  const scope = String(formData.get('scope') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim().slice(0, MAX_NAME)
  const query = normaliseQuery(String(formData.get('query') ?? ''))
  const shared = formData.get('shared') === 'on'
  const isDefault = formData.get('isDefault') === 'on'

  if (!scope) return { error: 'No scope on this view.' }
  if (!name) return { error: 'Give the view a name.' }

  if (isDefault) {
    await prisma.savedView.updateMany({ where: { userId: user.id, scope }, data: { isDefault: false } })
  }

  await prisma.savedView.upsert({
    where: { userId_scope_name: { userId: user.id, scope, name } },
    create: { userId: user.id, companyId: user.companyId, scope, name, query, shared, isDefault },
    update: { query, shared, isDefault },
  })

  revalidatePath(scope === 'dashboard' ? '/' : `/reports/${scope}`)
  return {}
}

export async function deleteView(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')

  // Deleting is limited to your own views; a shared view belongs to its author.
  const view = await prisma.savedView.findFirst({ where: { id, userId: user.id } })
  if (!view) return { error: 'That view is not yours to delete.' }

  await prisma.savedView.delete({ where: { id } })
  revalidatePath(view.scope === 'dashboard' ? '/' : `/reports/${view.scope}`)
  return {}
}

export async function saveDashboardLayout(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  const hidden = String(formData.get('hidden') ?? '')
  const order = String(formData.get('order') ?? '')

  await setPreference(user.id, 'dashboard.layout', JSON.stringify({ hidden: split(hidden), order: split(order) }))
  revalidatePath('/')
  return {}
}

function split(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
