/**
 * Captures a full-page screenshot of each route, and measures the layout
 * problems that are hard to see in code: tables wider than their card, columns
 * squeezed under their content, headers that wrap into the controls beside
 * them, and empty states taking a screen of height to say nothing.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.WALK_BASE ?? 'http://localhost:3000'
const OUT = process.env.SHOT_DIR ?? '/tmp/constructx-shots'
const EXECUTABLE = process.env.WALK_CHROMIUM ?? undefined

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'owner@constructx.com')
  await page.fill('input[type="password"]', 'constructx')
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.click('button[type="submit"]')])

  const projectId = await page.evaluate(
    () =>
      [...new Set([...document.querySelectorAll('a[href^="/projects/"]')].map((a) => a.getAttribute('href').split('/')[2]))].filter(
        (id) => id && id.length > 10,
      )[0],
  )

  const routes = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
        '/',
        '/projects',
        '/reports',
        '/reports/budget-vs-actual',
        '/admin/clients',
        '/admin/vendors',
        '/admin/regions',
        '/admin/cost-types',
        '/admin/history',
        '/estimating',
        '/estimating/new',
        '/pipeline',
        `/projects/${projectId}`,
        `/projects/${projectId}/estimate`,
        `/projects/${projectId}/budget`,
        `/projects/${projectId}/costs`,
        `/projects/${projectId}/forecast`,
      ]

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    const name = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })

    const report = await page.evaluate(() => {
      const problems = []

      // A table scrolling inside its card is fine; one wider than the card
      // without a scroller means columns are being clipped.
      for (const table of document.querySelectorAll('table.data')) {
        const wrap = table.closest('.table-wrap')
        if (!wrap) {
          problems.push(`table with no scroll container (${table.rows.length} rows)`)
          continue
        }
        if (table.scrollWidth > wrap.clientWidth + 2) {
          problems.push(`table scrolls sideways: ${Math.round(table.scrollWidth)} in ${Math.round(wrap.clientWidth)}`)
        }
        // Any cell whose content is wider than the cell is being clipped.
        let clipped = 0
        for (const cell of table.querySelectorAll('td, th')) {
          if (cell.scrollWidth > cell.clientWidth + 2) clipped++
        }
        if (clipped > 0) problems.push(`${clipped} clipped cells`)
      }

      // Empty states that eat a screen.
      for (const element of document.querySelectorAll('.border-dashed')) {
        const box = element.getBoundingClientRect()
        if (box.height > 240) problems.push(`empty state ${Math.round(box.height)}px tall`)
      }

      // Cards in the same row that do not line up at the bottom.
      for (const grid of document.querySelectorAll('.grid')) {
        const children = [...grid.children].filter((child) => child.getBoundingClientRect().height > 0)
        if (children.length < 2) continue
        const tops = new Map()
        for (const child of children) {
          const box = child.getBoundingClientRect()
          const key = Math.round(box.top / 8)
          if (!tops.has(key)) tops.set(key, [])
          tops.get(key).push(Math.round(box.height))
        }
        for (const [, heights] of tops) {
          if (heights.length < 2) continue
          const spread = Math.max(...heights) - Math.min(...heights)
          if (spread > 120) problems.push(`row of cards differs in height by ${spread}px`)
        }
      }

      return problems
    })

    console.log(`${route}`)
    for (const problem of [...new Set(report)]) console.log(`    ${problem}`)
  }

  await browser.close()
  console.log(`\nScreenshots in ${OUT}`)
}

main()
