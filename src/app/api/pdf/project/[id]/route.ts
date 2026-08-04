import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { buildProjectSheets } from '@/lib/queries/project-spec'
import { sheetsToPdf } from '@/lib/pdf-report'
import { buildPdf, pdfResponse } from '@/lib/pdf'
import { date } from '@/lib/format'

/** Full project report as a PDF, rendered from the same spec as the workbook. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) return new Response('Not found', { status: 404 })

  const { project } = bundle
  const { sheets, asOf } = buildProjectSheets(bundle, can(user.role, 'view:margins'))

  const document = buildPdf(
    sheetsToPdf(sheets, {
      title: `${project.number} ${project.name}`,
      subtitle: 'Project financial report',
      company: user.companyName,
      notes: [
        user.companyName,
        project.client?.name ? `Client: ${project.client.name}` : 'No client on record',
        `Data date ${date(project.dataDate ?? new Date())}`,
      ],
    }),
  )
  return pdfResponse(document, `constructx-${project.number}-${asOf}.pdf`)
}
