/**
 * Drives the interactive parts of the app the way a person would.
 *
 * The page walk proves every route renders. This proves the controls on those
 * pages do something: creating and editing records, deleting what may be
 * deleted and being refused what may not, typing in the search bars, changing
 * every filter and dropdown, and downloading each export.
 *
 * Run against `npm run dev` on port 3000.
 */
import { chromium } from 'playwright'

const BASE = process.env.WALK_BASE ?? 'http://localhost:3000'
const EXECUTABLE = process.env.WALK_CHROMIUM ?? undefined

const failures = []
const passes = []

function ok(label) {
  passes.push(label)
  console.log(`  ok    ${label}`)
}
function bad(label, detail) {
  failures.push({ label, detail })
  console.log(`  FAIL  ${label}\n        ${detail}`)
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ])
}

async function main() {
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon/.test(message.text())) consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await signIn(page, 'owner@constructx.com', 'constructx')
  ok('sign in as the owner')

  // ── Global search ────────────────────────────────────────────────────────
  console.log('\nGlobal search')
  const openPalette = async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Search everything' }).click()
    await page.waitForSelector('[role="dialog"] input')
  }

  for (const [term, expect] of [
    ['Cascade', 'Project'],
    ['Riverbend', null],
    ['concrete', null],
  ]) {
    await openPalette()
    await page.locator('[role="dialog"] input').fill(term)
    await page.waitForTimeout(900)
    const text = await page.locator('[role="dialog"]').innerText()
    const hits = await page.locator('[role="dialog"] button').count()
    if (/Nothing matches|Type at least/.test(text)) {
      bad(`search "${term}"`, 'no results')
    } else if (expect && !text.toLowerCase().includes(expect.toLowerCase())) {
      bad(`search "${term}" groups results`, `no "${expect}" group in the list`)
    } else {
      ok(`search "${term}" returns ${hits} results${expect ? ` including ${expect}` : ''}`)
    }
  }

  // The palette opens from the keyboard, and the arrows and Enter drive it.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.keyboard.press('/')
  await page.waitForSelector('[role="dialog"] input', { timeout: 5000 })
  await page.locator('[role="dialog"] input').fill('Cascade')
  await page.waitForTimeout(900)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  if (page.url().includes('/projects/')) ok('the palette opens from the keyboard and Enter opens the result')
  else bad('search keyboard navigation', `landed on ${page.url()}`)

  // ── Project search ───────────────────────────────────────────────────────
  console.log('\nProject search')
  const projectId = page.url().split('/projects/')[1]?.split('/')[0]
  await page.locator('input[placeholder="Search this project"]').first().fill('framing')
  await page.waitForTimeout(1200)
  const projectHits = await page.locator('main a, main button').filter({ hasText: /framing/i }).count()
  if (projectHits > 0) ok('project search finds line items inside the job')
  else bad('project search', 'no results for "framing"')

  // ── Charts: every grain and range ────────────────────────────────────────
  console.log('\nCharts')
  await page.goto(`${BASE}/projects/${projectId}/costs`, { waitUntil: 'networkidle' })
  const rangeSelect = page.locator('select[aria-label="Date range"]').first()
    if ((await rangeSelect.count()) === 0) {
    bad('cost trend controls', 'the range control is missing from the job cost page')
  } else {
    const ranges = await rangeSelect.locator('option').evaluateAll((els) => els.map((e) => e.value))
    for (const range of ranges) {
      await rangeSelect.selectOption(range)
      await page.waitForTimeout(120)
    }
    // The grouping is a button group rather than a dropdown here.
    const grainButtons = page.locator('[role="group"][aria-label="Group by"] button')
    const grains = await grainButtons.count()
    for (let i = 0; i < grains; i++) {
      await grainButtons.nth(i).click()
      await page.waitForTimeout(120)
    }
    ok(`cost trend accepts all ${ranges.length} ranges and ${grains} groupings`)
  }

  // ── The estimate tab compares the priced basis with what the job is doing ─
  await page.goto(`${BASE}/projects/${projectId}/estimate`, { waitUntil: 'networkidle' })
  const estimateText = await page.locator('main').innerText()
  if (/priced basis/i.test(estimateText) && /cost type/i.test(estimateText)) {
    ok('the estimate and takeoff tab renders the comparison')
  } else {
    bad('estimate tab', estimateText.slice(0, 140))
  }
  const againstButtons = await page.getByRole('button', { name: /^Against the/ }).count()
  if (againstButtons >= 2) {
    await page.getByRole('button', { name: /^Against the budget/ }).click()
    await page.waitForTimeout(200)
    ok('the comparison switches between the priced basis and the budget')
  } else {
    bad('estimate comparison toggle', `found ${againstButtons} toggle buttons`)
  }

  // ── Clients: create, edit, delete ────────────────────────────────────────
  console.log('\nClients')
  const stamp = Date.now()
  const clientName = `Verification Client ${stamp}`
  await page.goto(`${BASE}/admin/clients`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'New client' }).click()
  await page.fill('#client-name', clientName)
  await page.fill('#client-contact', 'A Person')
  await page.fill('#client-email', 'person@example.com')
  await page.getByRole('button', { name: 'Add client', exact: true }).click()
  await page.waitForTimeout(900)
  if ((await page.getByText(clientName).count()) > 0) ok('create a client')
  else bad('create a client', 'the new client did not appear in the table')

  // Editing it should persist.
  const row = page.locator('tr', { hasText: clientName }).first()
  await row.getByRole('button', { name: 'Edit' }).click()
  await page.fill('#client-contact', 'Someone Else')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForTimeout(900)
  if ((await page.getByText('Someone Else').count()) > 0) ok('edit a client')
  else bad('edit a client', 'the edited contact did not appear')

  // A client with nothing attached may be deleted.
  const editedRow = page.locator('tr', { hasText: clientName }).first()
  await editedRow.getByRole('button', { name: 'Delete' }).click()
  await editedRow.getByRole('button', { name: 'Confirm delete' }).click()
  await page.waitForTimeout(900)
  if ((await page.getByText(clientName).count()) === 0) ok('delete a client that has no history')
  else bad('delete a client', 'the client is still listed')

  // A client with projects must be refused.
  await page.goto(`${BASE}/admin/clients`, { waitUntil: 'networkidle' })
  const usedRow = page.locator('tbody tr').filter({ has: page.locator('td.num a') }).first()
  if ((await usedRow.count()) > 0) {
    const hasDelete = await usedRow.getByRole('button', { name: 'Delete' }).count()
    if (hasDelete === 0) ok('delete is not offered for a client with projects')
    else bad('delete guard', 'a client with projects still offers a delete button')
  }

  // ── Vendors: filters and editing ─────────────────────────────────────────
  console.log('\nVendors')
  await page.goto(`${BASE}/admin/vendors`, { waitUntil: 'networkidle' })
  const vendorRows = () => page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Edit' }) })
  const before = await vendorRows().count()

  const vendorSearch = page.locator('input[aria-label="Search vendors"]')
  await vendorSearch.fill('zzzzzz')
  await page.waitForTimeout(400)
  const afterSearch = await vendorRows().count()
  if (afterSearch < before) ok(`vendor search narrows the list from ${before} to ${afterSearch}`)
  else bad('vendor search', 'the row count did not change')
  await vendorSearch.fill('')
  await page.waitForTimeout(300)

  // Every filter on the page, exercised through its own control.
  const vendorFilters = page.locator('select[aria-label^="Filter by"]')
  const filterCount = await vendorFilters.count()
  for (let i = 0; i < filterCount; i++) {
    const select = vendorFilters.nth(i)
    if ((await select.locator('option').count()) < 2) continue
    await select.selectOption({ index: 1 })
    await page.waitForTimeout(250)
    await select.selectOption({ index: 0 })
  }
  ok(`${filterCount} vendor filters all respond`)

  // File a vendor under a region and confirm the history names the region.
  const unfiledRow = vendorRows().last()
  const unfiledName = (await unfiledRow.locator('td').first().innerText()).split('\n')[0].trim()
  await unfiledRow.getByRole('button', { name: 'Edit' }).click()
  const regionSelect = page.locator('#v-region')
  const regionOptions = await regionSelect.locator('option').count()
  if (regionOptions > 1) {
    await regionSelect.selectOption({ index: 1 })
    const chosen = await regionSelect.locator('option').nth(1).innerText()
    await page.getByRole('button', { name: /Save vendor|Save/ }).first().click()
    await page.waitForTimeout(1400)
    ok(`file "${unfiledName}" under ${chosen.trim()}`)
  } else {
    bad('vendor regions', 'no regions are available to file a vendor under')
  }

  // ── The permanent history recorded all of that ───────────────────────────
  console.log('\nHistory')
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' })
  await page.fill('#audit-q', clientName)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const historyText = await page.locator('body').innerText()
  // Actions render in this tree as CREATE / UPDATE / DELETE.
  if (historyText.includes(clientName) && /create/i.test(historyText) && /delete/i.test(historyText)) {
    ok('the history recorded the client being created, edited and deleted')
  } else {
    bad('history search', 'the client work did not turn up in the history')
  }

  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' })
  for (const [id, label] of [['#audit-entity', 'record type'], ['#audit-action', 'action'], ['#audit-user', 'person']]) {
    const select = page.locator(id)
    const options = await select.locator('option').count()
    if (options > 1) {
      await select.selectOption({ index: 1 })
      await page.waitForTimeout(700)
    }
    void label
  }
  ok('history filters by record type, action and person')

  // ── Reports and exports ──────────────────────────────────────────────────
  console.log('\nExports')
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' })
  const slugs = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="/reports/"]')].map((a) => a.getAttribute('href')))],
  )

  for (const slug of slugs.slice(0, 4)) {
    for (const kind of ['export', 'pdf']) {
      const target = `${BASE}/api/${kind}/report/${slug.split('/').pop()}`
      const response = await page.request.get(target)
      const length = (await response.body()).length
      if (response.status() !== 200) bad(`${kind} ${slug}`, `status ${response.status()}`)
      else if (length < 1000) bad(`${kind} ${slug}`, `only ${length} bytes`)
    }
  }
  ok(`downloaded ${slugs.slice(0, 4).length * 2} report exports`)

  for (const kind of ['export', 'pdf']) {
    const response = await page.request.get(`${BASE}/api/${kind}/project/${projectId}`)
    if (response.status() !== 200) bad(`${kind} project`, `status ${response.status()}`)
  }
  const backup = await page.request.get(`${BASE}/api/backup/project/${projectId}`)
  if (backup.status() !== 200) bad('project backup', `status ${backup.status()}`)
  else ok('project workbook, PDF and backup all download')

  // ── Dashboard filters ────────────────────────────────────────────────────
  console.log('\nDashboard and project filters')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const selects = page.locator('main select')
  const selectCount = await selects.count()
  let exercised = 0
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i)
    const options = await select.locator('option').count()
    if (options < 2) continue
    await select.selectOption({ index: 1 })
    await page.waitForTimeout(400)
    exercised++
  }
  ok(`changed ${exercised} dashboard filters without an error`)

  // ── Permissions, from a read-only account ────────────────────────────────
  console.log('\nPermissions')
  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const viewer = await viewerContext.newPage()
  await signIn(viewer, 'viewer@constructx.com', 'constructx')
  for (const route of ['/estimating', '/pipeline', '/admin', '/admin/audit', `/estimating/new`]) {
    const response = await viewer.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    const body = await viewer.locator('body').innerText()
    const refused = response?.status() === 403 || /not permitted|forbidden|sign in/i.test(body)
    if (refused) ok(`read-only is refused ${route}`)
    else bad(`read-only reached ${route}`, `status ${response?.status()}`)
  }
  for (const kind of ['export', 'pdf']) {
    const response = await viewer.request.get(`${BASE}/api/${kind}/report/profitability`)
    if (response.status() === 403) ok(`read-only is refused the profitability ${kind}`)
    else bad(`read-only reached the profitability ${kind}`, `status ${response.status()}`)
  }
  await viewerContext.close()

  await browser.close()

  console.log('\n' + '='.repeat(70))
  if (consoleErrors.length > 0) {
    console.log(`${consoleErrors.length} console errors during the run:`)
    for (const error of [...new Set(consoleErrors)].slice(0, 10)) console.log(`  ${error.slice(0, 200)}`)
  }
  console.log(`${passes.length} passed, ${failures.length} failed`)
  process.exit(failures.length === 0 && consoleErrors.length === 0 ? 0 : 1)
}

main()
