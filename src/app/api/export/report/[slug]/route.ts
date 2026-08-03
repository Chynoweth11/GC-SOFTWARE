import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildReportSpec } from '@/lib/queries/report-spec'
import { buildWorkbook, workbookResponse } from '@/lib/excel'

/**
 * Excel export for every report. Reads the same spec the on-screen report and
 * the PDF read, so the three can never disagree.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { slug } = await params
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
  const spec = await buildReportSpec(slug, user, searchParams)
  if (!spec.ok) return new Response(spec.message, { status: spec.status })

  const asOf = new Date().toISOString().slice(0, 10)
  const workbook = buildWorkbook(spec.sheets, { title: spec.title, company: spec.data.company.name })
  return workbookResponse(workbook, `constructx-${slug}-${asOf}.xlsx`)
}
