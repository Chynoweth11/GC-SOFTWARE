import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { buildProjectSheets } from '@/lib/queries/project-spec'
import { getProjectWageSheets } from '@/lib/queries/wage-rates'
import { getProjectCompliance, getProjectLabor } from '@/lib/queries/labor'
import { buildWorkbook, workbookResponse } from '@/lib/excel'

/** Full project export: every tab of the project workspace as one workbook. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) return new Response('Not found', { status: 404 })

  // Wage rates ride along only for a reader entitled to them, so an export
  // cannot become a way around the permission that governs the page.
  const showLabor = can(user.role, 'view:wage_rates')
  const wageSheets = showLabor ? await getProjectWageSheets(id, user.companyId) : []
  const labor = showLabor
    ? {
        assignments: await getProjectLabor(id, user.companyId),
        compliance: await getProjectCompliance(id, user.companyId),
      }
    : undefined
  const { sheets, asOf } = buildProjectSheets(bundle, can(user.role, 'view:margins'), wageSheets, labor)
  const workbook = buildWorkbook(sheets, {
    title: `${bundle.project.number} ${bundle.project.name}`,
    company: user.companyName,
  })
  return workbookResponse(workbook, `constructx-${bundle.project.number}-${asOf}.xlsx`)
}
