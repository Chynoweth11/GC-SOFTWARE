import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { exportProject } from '@/lib/backup'

/**
 * A project as one restorable file.
 *
 * Requires the same capability as editing the project's setup: a backup carries
 * every stored figure on the job, so being able to take one is being able to
 * read all of it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!can(user.role, 'edit:project_setup')) return new Response('Your role cannot export a project backup', { status: 403 })

  const { id } = await params
  const backup = await exportProject(id, user.companyId)
  if (!backup) return new Response('Not found', { status: 404 })

  const filename = `constructx-backup-${String(backup.project.number ?? 'project')}-${backup.exportedAt.slice(0, 10)}.json`
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
