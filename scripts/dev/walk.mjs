/**
 * Walks every page in the running app as a signed-in user and reports anything
 * broken: server errors, React errors in the console, hydration mismatches,
 * pages that render nothing, and tables or panels that overflow their column.
 *
 * Run against `npm run dev` on port 3000.
 */
import { chromium } from 'playwright'

const BASE = process.env.WALK_BASE ?? 'http://localhost:3000'
const EMAIL = process.env.WALK_EMAIL ?? 'owner@constructx.com'
const PASSWORD = process.env.WALK_PASSWORD ?? 'constructx'

const EXECUTABLE = process.env.WALK_CHROMIUM ?? undefined

async function main() {
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const problems = []
  let current = ''

  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return
    const text = message.text()
    // Chrome reports a failed favicon and similar noise; only React and app
    // errors are interesting here.
    if (/favicon|Download the React DevTools/i.test(text)) return
    problems.push({ page: current, kind: message.type() === 'error' ? 'console error' : 'console warning', text: text.slice(0, 300) })
  })
  page.on('pageerror', (error) => {
    problems.push({ page: current, kind: 'page error', text: String(error).slice(0, 300) })
  })

  // ── Sign in ──────────────────────────────────────────────────────────────
  current = '/login'
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }), page.click('button[type="submit"]')])

  // ── Collect the routes to walk ───────────────────────────────────────────
  const projectIds = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/projects/"]')]
      .map((a) => a.getAttribute('href'))
      .map((href) => href?.split('/')[2])
      .filter((id) => id && id.length > 10),
  )
  const project = [...new Set(projectIds)][0]

  const reportSlugs = await (async () => {
    await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' })
    return page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href^="/reports/"]')].map((a) => a.getAttribute('href')))],
    )
  })()

  const estimateId = await (async () => {
    await page.goto(`${BASE}/estimating`, { waitUntil: 'networkidle' })
    return page.evaluate(() => {
      const link = [...document.querySelectorAll('a[href^="/estimating/"]')].find((a) => {
        const parts = (a.getAttribute('href') ?? '').split('/')
        // "/estimating/new" is a route, not an estimate.
        return parts.length === 3 && parts[2] !== 'new' && parts[2].length > 10
      })
      return link?.getAttribute('href')?.split('/')[2] ?? null
    })
  })()

  /*
    A contract document to walk the breakdown page of. Looked for across every
    project rather than only the first, because a job with no change orders on
    it is perfectly normal and would otherwise leave that page unwalked.
  */
  let documentProject = null
  let documentId = null
  for (const candidate of [...new Set(projectIds)]) {
    await page.goto(`${BASE}/projects/${candidate}/changes`, { waitUntil: 'networkidle' })
    const found = await page.evaluate(() => {
      const link = [...document.querySelectorAll('a[href*="/changes/"]')].find((a) => {
        const parts = (a.getAttribute('href') ?? '').split('/')
        return parts.length === 5 && parts[4].length > 10
      })
      return link?.getAttribute('href')?.split('/')[4] ?? null
    })
    if (found) {
      documentProject = candidate
      documentId = found
      break
    }
  }

  const routes = [
    '/',
    '/projects',
    '/estimating',
    '/pipeline',
    '/reports',
    '/admin',
    '/admin/users',
    '/admin/clients',
    '/admin/cost-types',
    '/admin/trades',
    '/admin/vendors',
    '/admin/labor',
    '/admin/payroll',
    '/admin/import',
    '/admin/restore',
    '/admin/audit',
    '/estimating/new',
    ...reportSlugs,
    ...(project
      ? [
          `/projects/${project}`,
          `/projects/${project}/estimate`,
          `/projects/${project}/budget`,
          `/projects/${project}/costs`,
          `/projects/${project}/commitments`,
          `/projects/${project}/changes`,
          `/projects/${project}/billing`,
          `/projects/${project}/subs`,
          `/projects/${project}/forecast`,
          `/projects/${project}/poc`,
          `/projects/${project}/cashflow`,
          `/projects/${project}/buyout`,
          `/projects/${project}/quantities`,
          `/projects/${project}/labor`,
          ...(documentId ? [`/projects/${documentProject}/changes/${documentId}`] : []),
          `/projects/${project}/settings`,
        ]
      : []),
    ...(estimateId
      ? [
          `/estimating/${estimateId}`,
          `/estimating/${estimateId}/setup`,
          `/estimating/${estimateId}/takeoff`,
          `/estimating/${estimateId}/gc`,
          `/estimating/${estimateId}/leveling`,
        ]
      : []),
  ]

  console.log(`Walking ${routes.length} routes\n`)

  for (const route of routes) {
    current = route
    let response
    try {
      response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 })
    } catch (error) {
      problems.push({ page: route, kind: 'navigation', text: String(error).slice(0, 200) })
      continue
    }

    const status = response?.status() ?? 0
    if (status >= 400) problems.push({ page: route, kind: 'http', text: `status ${status}` })

    const check = await page.evaluate(() => {
      const body = document.body
      const text = (body.innerText ?? '').trim()

      // Anything wider than the viewport means a table or panel is pushing the
      // page sideways instead of scrolling inside its own container.
      const overflowing = [...document.querySelectorAll('*')]
        .filter((element) => {
          const style = getComputedStyle(element)
          if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') return false
          return element.scrollWidth > document.documentElement.clientWidth + 2
        })
        .slice(0, 4)
        .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`)

      return {
        length: text.length,
        pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        overflowing,
        hasErrorText: /Application error|Internal Server Error|Unhandled Runtime/i.test(text),
        emDashes: (text.match(/[—–…]/g) ?? []).length,
      }
    })

    if (check.hasErrorText) problems.push({ page: route, kind: 'error page', text: 'rendered an error page' })
    if (check.length < 200) problems.push({ page: route, kind: 'empty', text: `only ${check.length} characters rendered` })
    if (check.pageScrollsSideways) {
      problems.push({ page: route, kind: 'sideways scroll', text: check.overflowing.join(', ') || 'body wider than viewport' })
    }
    if (check.emDashes > 0) problems.push({ page: route, kind: 'em dash', text: `${check.emDashes} on screen` })

    console.log(`  ${status} ${route}`)
  }

  await browser.close()

  console.log('\n' + '='.repeat(70))
  if (problems.length === 0) {
    console.log('No problems found.')
  } else {
    console.log(`${problems.length} problems:\n`)
    for (const problem of problems) console.log(`  [${problem.kind}] ${problem.page}\n      ${problem.text}`)
  }
  process.exit(problems.length === 0 ? 0 : 1)
}

main()
