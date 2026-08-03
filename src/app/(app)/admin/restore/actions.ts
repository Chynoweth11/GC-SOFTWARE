'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { recordAudit } from '@/lib/audit'
import { restoreProject, type RestoreResult } from '@/lib/backup'

/** 25 MB — comfortably above the largest project this system produces. */
const MAX_BYTES = 25 * 1024 * 1024

export async function restoreFromBackup(_prev: RestoreResult | null, formData: FormData): Promise<RestoreResult> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')

  const file = formData.get('backup')
  if (!(file instanceof File) || file.size === 0) {
    return { created: {}, warnings: [], error: 'Choose a backup file to restore.' }
  }
  if (file.size > MAX_BYTES) {
    return { created: {}, warnings: [], error: 'That file is larger than 25 MB and was not read.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { created: {}, warnings: [], error: 'That file is not valid JSON.' }
  }

  const result = await restoreProject(parsed, user)
  if (result.error) return result

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'Project',
    entityId: result.projectId!,
    action: 'RESTORE',
    summary: `Restored ${result.number} from a backup file (${file.name})`,
  })

  revalidatePath('/projects')
  revalidatePath('/')
  return result
}
