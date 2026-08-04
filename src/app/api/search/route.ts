import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { searchEverything } from '@/lib/queries/search'

/** Backs the global search box. Results are already filtered by what the role may open. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return Response.json({ query: '', hits: [], truncated: false }, { status: 401 })

  const query = request.nextUrl.searchParams.get('q') ?? ''
  const results = await searchEverything(user.companyId, user.role, query)
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
