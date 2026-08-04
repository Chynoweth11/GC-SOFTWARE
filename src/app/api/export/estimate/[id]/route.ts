import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { buildEstimateSheets } from '@/lib/queries/estimate-spec'
import { buildWorkbook, workbookResponse } from '@/lib/excel'

/** Estimate export: takeoff, general conditions, leveling and the bid build-up. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  // The same capability that opens the estimate on screen. Without this an
  // export becomes a way to read what the page refuses to show.
  if (!can(user.role, 'view:estimates')) return new Response('Your role cannot read estimates', { status: 403 })

  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) return new Response('Not found', { status: 404 })

  const sheets = buildEstimateSheets(bundle, can(user.role, 'view:markups'))
  const workbook = buildWorkbook(sheets, { title: bundle.estimate.name, company: user.companyName })
  return workbookResponse(workbook, `constructx-estimate-${bundle.estimate.name.replace(/\s+/g, '-')}.xlsx`)
}
