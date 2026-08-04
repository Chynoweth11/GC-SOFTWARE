import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { searchProject } from '@/lib/queries/search'

/** Backs the search box inside a project. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return Response.json({ groups: [] }, { status: 401 })

  const projectId = request.nextUrl.searchParams.get('project') ?? ''
  const query = request.nextUrl.searchParams.get('q') ?? ''
  if (!projectId) return Response.json({ groups: [] })

  const groups = await searchProject(projectId, user.companyId, query)
  return Response.json({ groups }, { headers: { 'Cache-Control': 'no-store' } })
}
