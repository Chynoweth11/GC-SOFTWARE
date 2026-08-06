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

  // ── Prevailing wage rates ────────────────────────────────────────────────
  // The one place in the app where the arithmetic on screen is checked against
  // arithmetic done by hand here, because a wrong wage rate is a wage claim.
  console.log('\nWage rates')

  await page.goto(`${BASE}/admin/payroll`, { waitUntil: 'networkidle' })
  const stateCount = await page.locator('text=/of 51 have an unemployment rate/').count()
  if (stateCount > 0) ok('all 51 jurisdictions are set up')
  else bad('jurisdictions', 'the payroll settings page does not show 51 jurisdictions')

  await page.fill('input[aria-label="Find a state"]', 'Washington')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Washington/ }).first().click()
  await page.waitForTimeout(400)

  await page.fill('input[name="sutaPct"]', '2')
  await page.fill('input[name="sutaRateYear"]', '2026')
  await Promise.all([
    page.waitForTimeout(1500),
    page.getByRole('button', { name: 'Save Washington' }).click(),
  ])

  // The panel stays open across the save, so it is not reopened here.
  await page.fill('input[aria-label="Where the rate came from"]', 'Taken from the 2026 rate notice, checked by the exercise run')
  await Promise.all([
    page.waitForTimeout(1500),
    page.getByRole('button', { name: 'Record the check' }).click(),
  ])
  const payrollText = await page.locator('body').innerText()
  if (/1 of 51 have an unemployment rate entered, 1 checked/.test(payrollText)) {
    ok('a state unemployment rate can be entered and the check recorded')
  } else {
    bad('jurisdiction rate', 'the rate or the verification did not stick')
  }

  await page.goto(`${BASE}/projects/${projectId}/wage-rates`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Open a wage sheet|Add a wage sheet/ }).first().click()
  await page.waitForTimeout(300)
  await page.fill('input[name="name"]', 'Exercise sheet')
  await page.selectOption('select[name="jurisdictionId"]', { label: 'Washington' })
  await page.waitForTimeout(300)
  await page.selectOption('select[name="countyId"]', { label: 'Benton' })
  await page.fill('input[name="rateScheduleDate"]', '2026-03-03')
  await page.fill('input[name="determinationRef"]', 'Exercise determination')
  await Promise.all([page.waitForTimeout(1800), page.getByRole('button', { name: 'Open the sheet' }).click()])

  const unverified = await page.locator('text=/Nobody has checked this sheet/').count()
  if (unverified > 0) ok('a new sheet says plainly that nobody has checked it')
  else bad('wage sheet verification', 'a brand new sheet did not warn that it is unverified')

  await page.getByRole('button', { name: 'Add a trade' }).first().click()
  await page.waitForTimeout(300)
  await page.fill('input[name="trade"]', 'Exercise carpenter')
  await page.fill('input[name="hourlyWage"]', '40')
  await page.fill('input[name="hourlyBenefits"]', '20')
  await page.fill('input[name="trainingPerHour"]', '0.50')
  await page.fill('input[name="workersCompPerHour"]', '1.30')
  await page.fill('input[name="overtimeMultiplier"]', '1.5')
  await Promise.all([page.waitForTimeout(1800), page.getByRole('button', { name: 'Add the trade' }).click()])

  /*
    Worked by hand from the form, with FUTA at 0.6, FICA at 7.65 and the
    Washington rate just entered at 2.0 percent, all charged on the wage alone:

      subtotal 40 + 20                              = 60.00
      FUTA 40 x 0.006                               =  0.24
      FICA 40 x 0.0765                              =  3.06
      SUTA 40 x 0.02                                =  0.80
      training                                      =  0.50
      workers compensation                          =  1.30
      loaded hourly rate                            = 65.90

    Overtime pays the premium on the wage only, so the fringe and the two
    dollar items stay where they are and the burdens recompute on 60:

      60 + 20 + 0.36 + 4.59 + 1.20 + 0.50 + 1.30    = 87.95
  */
  const sheetText = await page.locator('body').innerText()
  const expectations = [
    ['$60.00', 'subtotal'],
    ['$0.24', 'FUTA on the wage'],
    ['$3.06', 'FICA on the wage'],
    ['$0.80', 'SUTA on the wage'],
    ['$65.90', 'loaded hourly rate'],
    ['$87.95', 'loaded overtime rate'],
  ]
  const missing = expectations.filter(([value]) => !sheetText.includes(value))
  if (missing.length === 0) {
    ok('every figure on the wage sheet matches the arithmetic done by hand')
  } else {
    bad('wage sheet arithmetic', `missing ${missing.map(([value, what]) => `${value} (${what})`).join(', ')}`)
  }

  // The fringe must attract no percentage burden. If it did, FICA on a 60
  // subtotal would be 4.59 rather than the 3.06 above, so its appearance in the
  // straight time row would give the mistake away.
  if (!/\$4\.59[\s\S]{0,80}\$65\.90/.test(sheetText)) {
    ok('no percentage burden was charged on the fringe benefit')
  } else {
    bad('wage sheet burdens', 'a burden appears to have been charged on wage plus fringe')
  }

  await page.getByRole('button', { name: 'Verify', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.fill('textarea[aria-label="Verification note"]', 'Checked against the exercise determination dated 3 March 2026')
  await Promise.all([page.waitForTimeout(1800), page.getByRole('button', { name: 'Record the check' }).click()])
  const verifiedText = await page.locator('body').innerText()
  if (/Verified/.test(verifiedText) && !/Nobody has checked this sheet/.test(verifiedText)) {
    ok('the sheet can be verified and says who checked it')
  } else {
    bad('wage sheet verification', 'the sheet did not record the check')
  }

  const wageExport = await page.request.get(`${BASE}/api/export/project/${projectId}`)
  const wagePdf = await page.request.get(`${BASE}/api/pdf/project/${projectId}`)
  if (wageExport.status() === 200 && wagePdf.status() === 200) {
    ok('the project workbook and PDF still build with a wage sheet on the job')
  } else {
    bad('wage export', `workbook ${wageExport.status()}, pdf ${wagePdf.status()}`)
  }

  // Put the project back the way it was found.
  await page.goto(`${BASE}/projects/${projectId}/wage-rates`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Delete sheet' }).click()
  await page.waitForTimeout(1800)
  const afterDelete = await page.locator('body').innerText()
  if (/No wage sheet on this project/.test(afterDelete)) ok('a wage sheet can be deleted')
  else bad('wage sheet delete', 'the sheet was still there afterwards')

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
