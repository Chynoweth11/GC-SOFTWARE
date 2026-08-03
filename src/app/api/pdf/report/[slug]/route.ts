import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildReportSpec } from '@/lib/queries/report-spec'
import { sheetsToPdf } from '@/lib/pdf-report'
import { buildPdf, pdfResponse } from '@/lib/pdf'
import { date } from '@/lib/format'

/** PDF export for every report, rendered from the same spec as the workbook. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { slug } = await params
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
  const spec = await buildReportSpec(slug, user, searchParams)
  if (!spec.ok) return new Response(spec.message, { status: spec.status })

  const asOf = new Date().toISOString().slice(0, 10)
  const document = buildPdf(
    sheetsToPdf(spec.sheets, {
      title: spec.title,
      subtitle: spec.description,
      company: spec.data.company.name,
      notes: [
        spec.data.company.name,
        `Generated ${date(new Date())}`,
        `${spec.data.projects.length} project${spec.data.projects.length === 1 ? '' : 's'} in view`,
      ],
    }),
  )
  return pdfResponse(document, `constructx-${slug}-${asOf}.pdf`)
}
