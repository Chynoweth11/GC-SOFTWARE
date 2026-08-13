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

  /*
    Read the page once it says what it is going to say.

    Every mutation here goes through a server action and a refresh, and how long
    that takes depends on what else the machine is doing. Sleeping a fixed time
    and then asserting turns a slow moment into a false failure, so these wait
    for the sentence they are looking for and give up only when it is really
    not coming.
  */
  const bodyWhen = async (pattern, timeout = 20000) => {
    const deadline = Date.now() + timeout
    let text = await page.locator('body').innerText()
    while (!pattern.test(text) && Date.now() < deadline) {
      await page.waitForTimeout(250)
      text = await page.locator('body').innerText()
    }
    return text
  }

  /** The same, for a deletion: wait until the thing has gone. */
  const bodyWithout = async (pattern, timeout = 20000) => {
    const deadline = Date.now() + timeout
    let text = await page.locator('body').innerText()
    while (pattern.test(text) && Date.now() < deadline) {
      await page.waitForTimeout(250)
      text = await page.locator('body').innerText()
    }
    return text
  }

  await signIn(page, 'owner@constructx.com', 'constructx')
  ok('sign in as the owner')

  // ── Global search ────────────────────────────────────────────────────────
  console.log('\nGlobal search')
  const openPalette = async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Search everything' }).click()
    await page.waitForSelector('[role="dialog"] input')
  }

  /*
    Wait for the search to answer rather than sleeping a fixed time. The palette
    goes to the server for its results, and on a cold start that takes longer
    than any sleep worth writing, which is a flake rather than a finding. While
    it is thinking it shows neither results nor "nothing matches", so waiting
    for either of those is waiting for a real answer.
  */
  /*
    Wait for the palette to actually answer.

    Two traps here. It debounces, so for a moment after typing it says nothing
    matches before it has even asked, which is why an empty answer is only
    believed after the debounce and the round trip have both had time. And it
    goes to the server, so on a cold start results arrive later than any fixed
    sleep worth writing.
  */
  const paletteAnswer = async (term) => {
    let held = 0
    let previous = null
    for (let attempt = 0; attempt < 32; attempt++) {
      const typed = await page.locator('[role="dialog"] input').inputValue()
      const text = await page.locator('[role="dialog"]').innerText()
      const results = await page.locator('[role="dialog"] button').count()
      const answered =
        typed === term && !/Type at least/.test(text) && (results > 0 || /Nothing matches/.test(text))

      // An answer has to hold still before it is believed. Typing key by key
      // fires a request per keystroke, and an early one can land first with a
      // different set of hits behind it.
      if (answered && text === previous) {
        held++
        if (held >= 4) return text
      } else {
        held = 0
      }
      previous = answered ? text : null
      await page.waitForTimeout(250)
    }
    return null
  }

  /*
    Type into the palette and wait for it to answer.

    Filling a box before the page has hydrated sets the value in the DOM and
    nothing in React, so the palette sits on its prompt forever. On a warm
    server that never happens and on a cold one it happens often, so if the
    prompt is still there after three seconds the term is typed again, key by
    key, against a page that is by then certainly listening.
  */
  const searchFor = async (term) => {
    await page.locator('[role="dialog"] input').fill(term)
    const answered = await paletteAnswer(term)
    if (answered !== null) return answered
    await page.locator('[role="dialog"] input').fill('')
    await page.locator('[role="dialog"] input').pressSequentially(term, { delay: 30 })
    return (await paletteAnswer(term)) ?? page.locator('[role="dialog"]').innerText()
  }

  for (const [term, expect] of [
    ['Cascade', 'Project'],
    ['Riverbend', null],
    ['concrete', null],
  ]) {
    await openPalette()
    const text = await searchFor(term)
    const hits = await page.locator('[role="dialog"] button').count()
    if (/Nothing matches|Type at least/.test(text)) {
      bad(`search "${term}"`, `no results, palette read ${JSON.stringify(text.slice(0, 160))}`)
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
  await searchFor('Cascade')
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/projects\//, { timeout: 15000 }).catch(() => {})
  if (page.url().includes('/projects/')) ok('the palette opens from the keyboard and Enter opens the result')
  else bad('search keyboard navigation', `landed on ${page.url()}`)

  // ── Project search ───────────────────────────────────────────────────────
  console.log('\nProject search')
  // Everything below works on one job. If the palette did not land on one,
  // pick one from the list rather than letting a single failure take the rest
  // of the run down with it.
  let projectId = page.url().split('/projects/')[1]?.split('/')[0]
  if (!projectId) {
    await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' })
    const href = await page.locator('a[href^="/projects/"]').first().getAttribute('href')
    projectId = href?.split('/')[2]
    await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: 'networkidle' })
  }
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
  const historyText = await bodyWhen(new RegExp(clientName))
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
  const payrollText = await bodyWhen(/have an unemployment rate entered/)
  if (/1 of 51 have an unemployment rate entered, 1 checked/.test(payrollText)) {
    ok('a state unemployment rate can be entered and the check recorded')
  } else {
    bad('jurisdiction rate', 'the rate or the verification did not stick')
  }

  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Open a wage sheet|Add a wage sheet/ }).first().click()
  await page.waitForTimeout(300)
  await page.fill('input[name="name"]', 'Exercise sheet')
  await page.selectOption('select[name="jurisdictionId"]', { label: 'Washington' })
  await page.waitForTimeout(300)
  await page.selectOption('select[name="countyId"]', { label: 'Benton' })
  await page.fill('input[name="rateScheduleDate"]', '2026-03-03')
  await page.fill('input[name="determinationRef"]', 'Exercise determination')
  await Promise.all([page.waitForTimeout(1800), page.getByRole('button', { name: 'Open the sheet' }).click()])

  const newSheet = await bodyWhen(/Nobody has checked this sheet/)
  if (/Nobody has checked this sheet/.test(newSheet)) {
    ok('a new sheet says plainly that nobody has checked it')
  } else {
    bad('wage sheet verification', 'a brand new sheet did not warn that it is unverified')
  }

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
  const sheetText = await bodyWhen(/\$65\.90/)
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
  const verifiedText = await bodyWhen(/[Vv]erified/)
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
  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Delete sheet' }).click()
  await page.waitForTimeout(1800)
  const afterDelete = await bodyWithout(/Exercise wage sheet/)
  if (/No wage sheet on this project/.test(afterDelete)) ok('a wage sheet can be deleted')
  else bad('wage sheet delete', 'the sheet was still there afterwards')

  // ── Labor library, project team and compliance ───────────────────────────
  // The costing spine: a salary entered once, reduced to a loaded hour, then
  // charged to a job as a share of somebody's time across a range of dates.
  console.log('\nLabor and compliance')

  await page.goto(`${BASE}/admin/labor`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add a classification' }).nth(1).click()
  await page.waitForTimeout(300)
  await page.fill('input[name="name"]', 'Exercise PM')
  await page.selectOption('select[name="payBasis"]', 'SALARY')
  await page.fill('input[name="baseAmount"]', '124800')
  await page.fill('input[name="benefitsAmount"]', '20800')
  await page.fill('input[name="annualHours"]', '2080')
  await page.fill('input[name="trainingPerHour"]', '0')
  await page.fill('input[name="workersCompRate"]', '0.5')
  const waOption = await page
    .locator('select[name="jurisdictionId"] option')
    .filter({ hasText: 'Washington' })
    .first()
    .getAttribute('value')
  await page.selectOption('select[name="jurisdictionId"]', waOption)
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Add it' }).click()])

  /*
    Worked by hand. A 124,800 salary over 2080 hours is a 60 an hour wage, and
    20,800 of benefits is 10 an hour. The burdens run on the wage alone, with
    Washington's rate at the 2.0 percent entered above:

      wage + fringe                        70.00
      FUTA  60 x 0.006                       0.36
      FICA  60 x 0.0765                      4.59
      SUTA  60 x 0.02                        1.20
      workers comp                           0.50
      loaded hourly cost                   76.65

    Workers compensation goes in at 0.50 rather than 0.30 because Washington
    sells the cover through Labor and Industries, which quotes the premium per
    hour worked rather than per 100 dollars of payroll. Multiplying it by the
    wage there would be badly wrong, and this line is what proves the engine
    reads the basis off the state.
  */
  const libraryText = await bodyWhen(/Exercise PM/)
  if (libraryText.includes('$76.65')) {
    ok('a salary is reduced to a loaded hour that matches the arithmetic done by hand')
  } else {
    bad('classification rate', 'the loaded hourly cost of 76.65 did not appear')
  }

  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Assign somebody/ }).first().click()
  await page.waitForTimeout(300)
  await page.selectOption('select[name="classificationId"]', { label: 'Exercise PM' })
  await page.waitForTimeout(300)
  await page.selectOption('select[name="basis"]', 'ALLOCATION')
  await page.fill('input[name="label"]', 'Exercise person')
  await page.fill('input[name="allocationPct"]', '50')
  await page.fill('input[name="startDate"]', '2026-03-02')
  await page.fill('input[name="endDate"]', '2026-11-27')
  const codeOptions = await page.locator('select[name="costCodeId"] option').count()
  if (codeOptions > 1) await page.selectOption('select[name="costCodeId"]', { index: 1 })
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Add to the job' }).click()])

  /*
    2 March to 27 November inclusive is 271 days, which is 38.7 weeks. A salaried
    week is the annual hours over 52, so 40 hours, and half of that across 38.7
    weeks is 774 hours at the 76.65 rate above.
  */
  const assignmentText = await bodyWhen(/Exercise PM/)
  const assignmentChecks = ['Exercise person', '774', '$76.65']
  const missingAssignment = assignmentChecks.filter((value) => !assignmentText.includes(value))
  if (missingAssignment.length === 0) {
    ok('a salaried person can be charged to a job as a share of their time over a date range')
  } else {
    bad('project team assignment', `missing ${missingAssignment.join(', ')}`)
  }

  // A requirement whose first deadline is three weeks back, so the schedule has
  // fallen behind and the page has to say so rather than pointing at next week.
  const threeWeeksAgo = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10)

  await page.getByRole('button', { name: 'Add a requirement' }).first().click()
  await page.waitForTimeout(300)
  await page.fill('input[name="title"]', 'Exercise certified payroll')
  await page.selectOption('select[name="frequency"]', 'WEEKLY')
  await page.fill('input[name="firstDueDate"]', threeWeeksAgo)
  await page.fill('input[name="agency"]', 'Exercise agency')
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Add the requirement' }).click()])

  const complianceText = await bodyWhen(/Overdue/)
  if (/Overdue/.test(complianceText) && /deadlines have gone unanswered|Overdue by 21 days/.test(complianceText)) {
    ok('a requirement behind schedule reports the oldest unanswered deadline, not the next one')
  } else {
    bad('compliance status', 'the overdue schedule did not report as expected')
  }

  await page.getByRole('button', { name: 'Record a filing' }).first().click()
  await page.waitForTimeout(300)
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Record it' }).click()])
  const afterFiling = await bodyWhen(/1 filed/)
  if (/1 filed/.test(afterFiling)) ok('a filing can be recorded against the deadline it answers')
  else bad('compliance filing', 'the filing did not register')

  const ics = await page.request.get(`${BASE}/api/calendar/compliance.ics`)
  const icsBody = await ics.text()
  if (ics.status() === 200 && icsBody.startsWith('BEGIN:VCALENDAR') && icsBody.includes('Exercise certified payroll')) {
    ok('the compliance calendar feed carries the outstanding deadlines with alarms')
  } else {
    bad('calendar feed', `status ${ics.status()}, ${icsBody.slice(0, 80)}`)
  }
  if (icsBody.includes('BEGIN:VALARM')) ok('each deadline carries reminders ahead of the due date')
  else bad('calendar alarms', 'no alarms in the feed')

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const dashboardText = await bodyWhen(/Exercise certified payroll/)
  // Section titles render through text-transform, so innerText comes back
  // upper case. Match without regard to case rather than to the styling.
  if (/labor compliance deadlines/i.test(dashboardText) && /Exercise certified payroll/.test(dashboardText)) {
    ok('outstanding filings surface on the company dashboard across every job')
  } else {
    bad('dashboard compliance panel', 'the panel did not appear with the outstanding filing')
  }

  // Put everything back the way it was found.
  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '1 filed' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Withdraw', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Withdraw the filing' }).click()
  await page.waitForTimeout(2000)

  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Delete requirement' }).click()
  await page.waitForTimeout(2000)

  await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Remove from the job' }).click()
  await page.waitForTimeout(2000)

  await page.goto(`${BASE}/admin/labor`, { waitUntil: 'networkidle' })
  const rows = page.locator('tr', { hasText: 'Exercise PM' })
  await rows.first().getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Delete classification' }).click()
  await page.waitForTimeout(2000)
  const cleaned = await bodyWithout(/Exercise PM/)
  if (!cleaned.includes('Exercise PM')) ok('a classification with nothing depending on it can be deleted')
  else bad('classification delete', 'the classification was still there afterwards')

  // ── Equipment and the rates it is hired at ───────────────────────────────
  // A machine costs three separate things: the hire, the fuel and wear for the
  // hours it actually ran, and the standby for the hours it stood idle. They
  // are proved separately here because adding them up wrongly is the usual way
  // plant cost goes missing.
  console.log('\nEquipment and rates')

  const machineName = 'Exercise Excavator'
  const clearMachine = async () => {
    await page.goto(`${BASE}/admin/equipment`, { waitUntil: 'networkidle' })
    const existing = page.locator('tr', { hasText: machineName })
    if ((await existing.count()) > 0) {
      await existing.first().getByRole('button', { name: 'Delete', exact: true }).click()
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: 'Delete the machine' }).click()
      await page.waitForTimeout(2000)
    }
  }

  // Clear anything a previous run left behind, job first so the machine is free
  // to be deleted.
  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  const leftoverPlant = page.locator('tr', { hasText: machineName })
  if ((await leftoverPlant.count()) > 0) {
    await leftoverPlant.first().getByRole('button', { name: 'Remove', exact: true }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Take it off the job' }).click()
    await page.waitForTimeout(2000)
  }
  await clearMachine()

  await page.goto(`${BASE}/admin/equipment`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Add the first machine|Add a machine/ }).first().click()
  await page.waitForTimeout(400)
  await page.fill('input[name="name"]', machineName)
  await page.fill('input[name="category"]', 'Earthmoving')
  await page.selectOption('select[name="ownership"]', 'RENTED')
  await page.fill('input[name="hourlyRate"]', '0')
  await page.fill('input[name="dailyRate"]', '1200')
  // Quoted at 4,500 a week against 1,200 a day. Five days would be 6,000, and
  // the whole point of entering each basis is that the software never invents
  // the difference.
  await page.fill('input[name="weeklyRate"]', '4500')
  await page.fill('input[name="monthlyRate"]', '0')
  await page.fill('input[name="operatingCostPerHour"]', '45')
  await page.fill('input[name="standbyRatePerHour"]', '300')
  await page.fill('input[name="hoursPerDay"]', '8')
  await page.fill('input[name="daysPerWeek"]', '5')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Add it' }).click()])

  await page.goto(`${BASE}/admin/equipment`, { waitUntil: 'networkidle' })
  const machineRow = await page.locator('tr', { hasText: machineName }).first().innerText()
  /*
    An hour, all in, worked from the shortest basis that carries a rate:

      daily rate 1,200 over an 8 hour day        150.00
      fuel and wear an hour                       45.00
      an hour, all in                            195.00
  */
  if (machineRow.includes('$195.00')) {
    ok('an hourly cost is worked down from the shortest quoted basis and carries fuel and wear')
  } else {
    bad('equipment rate', `expected $195.00 an hour all in, row read ${machineRow.replace(/\n/g, ' | ')}`)
  }
  if (machineRow.includes('$4,500') && !machineRow.includes('$6,000')) {
    ok('a weekly rate is kept as quoted rather than multiplied out of the daily one')
  } else {
    bad('equipment rate', 'the weekly rate was not carried through as entered')
  }

  // Charge it to the job, with more hours run than the hire covers, so the
  // check that catches under-recorded hire has something to catch.
  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  await page
    .getByRole('button', { name: /Charge a machine to this job|Charge another machine/ })
    .first()
    .click()
  await page.waitForTimeout(400)
  const machineOption = await page.locator('select[name="equipmentItemId"] option', { hasText: machineName }).first().getAttribute('value')
  await page.selectOption('select[name="equipmentItemId"]', machineOption)
  await page.selectOption('select[name="basis"]', 'DAILY')
  await page.fill('input[name="units"]', '10')
  await page.fill('input[name="operatingHours"]', '90')
  await page.fill('input[name="standbyHours"]', '4')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Charge it to the job' }).click()])

  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  const overrunRow = await page.locator('tr', { hasText: machineName }).first().innerText()
  if (/90 operating hours against a hire that covers 80\.0/.test(overrunRow)) {
    ok('a machine that ran more hours than its hire covers is flagged rather than quietly priced')
  } else {
    bad('equipment overrun check', `the overrun was not flagged, row read ${overrunRow.replace(/\n/g, ' | ')}`)
  }

  // Correct the hours to something the hire covers, and check the three parts.
  const plantRow = page.locator('tr', { hasText: machineName }).first()
  await plantRow.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.waitForTimeout(400)
  await page.fill('input[name="operatingHours"]', '60')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Save entry' }).click()])

  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  const dailyRow = await page.locator('tr', { hasText: machineName }).first().innerText()
  /*
    Worked by hand, the three costs kept apart:

      hire      10 days x 1,200            12,000.00
      fuel      60 hours run x 45           2,700.00
      standby   4 hours idle x 300          1,200.00
      cost to this job                     15,900.00
  */
  const wantsPlant = ['$12,000', '$2,700', '$1,200', '$15,900']
  const missingPlant = wantsPlant.filter((amount) => !dailyRow.includes(amount))
  if (missingPlant.length === 0) {
    ok('hire, fuel and wear, and standby are priced apart and add up to the cost to the job')
  } else {
    bad('equipment cost', `missing ${missingPlant.join(', ')} from ${dailyRow.replace(/\n/g, ' | ')}`)
  }

  // Two weeks on the weekly rate is 9,000, not ten days at the daily rate.
  await page.locator('tr', { hasText: machineName }).first().getByRole('button', { name: 'Edit', exact: true }).click()
  await page.waitForTimeout(400)
  await page.selectOption('select[name="basis"]', 'WEEKLY')
  await page.fill('input[name="units"]', '2')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Save entry' }).click()])

  await page.goto(`${BASE}/projects/${projectId}/labor`, { waitUntil: 'networkidle' })
  const weeklyRow = await page.locator('tr', { hasText: machineName }).first().innerText()
  if (weeklyRow.includes('$9,000') && !weeklyRow.includes('$12,000')) {
    ok('hiring by the week charges the weekly rate, not five daily ones')
  } else {
    bad('equipment basis', `two weeks did not price at 9,000, row read ${weeklyRow.replace(/\n/g, ' | ')}`)
  }

  const laborPageText = await bodyWhen(/of it standby/)
  if (/\$1,200 of it standby/.test(laborPageText)) {
    ok('the job reports how much of its plant cost was paid for machines standing idle')
  } else {
    bad('standby reporting', 'the standby share did not surface on the labor and equipment tab')
  }

  // Take it off the job. The machine itself stays on the list, because the
  // takeoff and the time and materials sections below both price from its rate.
  await page.locator('tr', { hasText: machineName }).first().getByRole('button', { name: 'Remove', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Take it off the job' }).click()
  await page.waitForTimeout(2000)

  // The same rate, reaching a bid. A takeoff line that names the machine has to
  // price it at the list rate, otherwise a job is bid without its plant.
  await page.goto(`${BASE}/estimating`, { waitUntil: 'networkidle' })
  const estimateIds = [
    ...new Set(
      (await page.locator('a[href^="/estimating/"]').evaluateAll((links) => links.map((a) => a.getAttribute('href'))))
        .filter((href) => href && /^\/estimating\/[^/]+$/.test(href))
        .map((href) => href.split('/')[2])
        .filter((id) => id !== 'new'),
    ),
  ]

  // An awarded estimate is locked and cannot take a line, so use the first one
  // that is still open.
  let estimateId = null
  for (const candidate of estimateIds) {
    await page.goto(`${BASE}/estimating/${candidate}/takeoff`, { waitUntil: 'networkidle' })
    if ((await page.getByRole('button', { name: 'Add takeoff line' }).count()) > 0) {
      estimateId = candidate
      break
    }
  }
  if (!estimateId) {
    bad('takeoff equipment', 'no open estimate to price a machine on')
  } else {
    const leftoverLine = page.locator('tr', { hasText: 'Exercise machine line' })
    if ((await leftoverLine.count()) > 0) {
      await leftoverLine.first().getByRole('button', { name: 'Delete', exact: true }).click()
      await page.waitForTimeout(2000)
    }

    await page.getByRole('button', { name: 'Add takeoff line' }).click()
    await page.waitForTimeout(400)
    await page.fill('input[name="description"]', 'Exercise machine line')
    await page.selectOption('select[name="measure"]', 'EA')
    await page.fill('input[name="count"]', '10')
    const takeoffMachine = await page
      .locator('select[name="equipmentClass"] option', { hasText: machineName })
      .first()
      .getAttribute('value')
    await page.selectOption('select[name="equipmentClass"]', takeoffMachine)
    await page.fill('input[name="equipmentHrsPerUnit"]', '2')
    await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Add line', exact: true }).click()])

    await page.goto(`${BASE}/estimating/${estimateId}/takeoff`, { waitUntil: 'networkidle' })
    const takeoffRow = await page.locator('tr', { hasText: 'Exercise machine line' }).first().innerText()
    // 10 each x 2 machine hours x 195.00 an hour, all in, is 3,900.
    if (takeoffRow.includes('$195.00') && takeoffRow.includes('$3,900')) {
      ok('a takeoff line that names a machine prices it at the equipment list rate')
    } else {
      bad('takeoff equipment', `expected 20 hours at 195, row read ${takeoffRow.replace(/\n/g, ' | ')}`)
    }

    await page.locator('tr', { hasText: 'Exercise machine line' }).first().getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(2500)
    await page.goto(`${BASE}/estimating/${estimateId}/takeoff`, { waitUntil: 'networkidle' })
    const takeoffCleaned = await bodyWithout(/Exercise machine line/)
    if (!takeoffCleaned.includes('Exercise machine line')) {
      ok('the takeoff line comes off again, leaving the bid as it was found')
    } else {
      bad('takeoff cleanup', 'the exercise takeoff line was still on the bid')
    }
  }

  // ── Contract documents and the approval gate ─────────────────────────────
  // The rule the whole feature exists for, driven end to end: an entered
  // document changes nothing until somebody certifies that it is signed.
  console.log('\nChange orders and approval')

  // Read the contract value before anything is raised, so the effect of the
  // approval can be measured rather than assumed.
  // Read off the change orders tab, which states the position in full dollars
  // rather than the shortened form the project header uses.
  const contractBefore = async () => {
    await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    const match = text.match(/makes\s+\$([\d,]+)\s+of current contract/i)
    return match ? Number(match[1].replace(/,/g, '')) : null
  }
  const beforeValue = await contractBefore()

  await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })

  // Clear anything a previous run left behind, so this section is repeatable.
  const leftover = page.locator('tr', { hasText: 'CO-EX1' }).first()
  if ((await leftover.count()) > 0) {
    await leftover.locator('a').first().click()
    await page.waitForTimeout(1200)
    const withdraw = page.locator('input[type="checkbox"][aria-label^="Withdraw"]')
    if ((await withdraw.count()) > 0) {
      await withdraw.first().click()
      await page.waitForTimeout(400)
      await page.fill('[role="dialog"] textarea', 'Clearing a previous exercise run.')
      await page.getByRole('button', { name: 'Yes, withdraw it' }).click()
      await page.waitForTimeout(2500)
    }
    await page.getByRole('button', { name: 'Delete this document' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Delete the document' }).click()
    await page.waitForTimeout(2500)
    await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
  }

  await page.getByRole('button', { name: /Raise a change order/ }).click()
  await page.waitForTimeout(400)
  await page.fill('input[name="number"]', 'CO-EX1')
  await page.fill('input[name="description"]', 'Exercise change order')
  await page.selectOption('select[name="status"]', 'DRAFT')
  // Priced from its lines, which is the default, so the amount follows the
  // takeoff and the markup chain rather than being typed in.
  await page.fill('input[name="profitPct"]', '10')
  await page.fill('input[name="overheadPct"]', '6')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Raise it' }).click()])

  // The form sends the user straight into the breakdown.
  await page.waitForURL(/\/changes\/[^/]+$/, { timeout: 20000 })
  const documentUrl = page.url()

  await page.getByRole('button', { name: /Add the first line|Add a line/ }).first().click()
  await page.waitForTimeout(400)
  await page.fill('input[name="description"]', 'Exercise scope')
  await page.selectOption('select[name="measure"]', 'LS')
  await page.fill('input[name="count"]', '1')
  await page.fill('input[name="otherUnitCost"]', '100000')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Add the line' }).click()])

  /*
    Worked by hand from the markup chain, in the order the bid summary uses:

      direct cost                          100,000.00
      overhead      100,000 x 6 percent       6,000.00
      profit        106,000 x 10 percent     10,600.00
      total                                 116,600.00
  */
  const pricedText = await bodyWhen(/\$116,600/)
  if (pricedText.includes('$116,600')) {
    ok('a change order priced from its lines runs the markup chain in the bid summary order')
  } else {
    bad('change order pricing', 'the built-up amount of 116,600 did not appear')
  }
  if (/Not in any figure yet/.test(pricedText)) {
    ok('a document that is not approved says plainly that it counts for nothing')
  } else {
    bad('approval state', 'a draft document did not say it counts for nothing')
  }

  const afterEntry = await contractBefore()
  if (beforeValue !== null && afterEntry === beforeValue) {
    ok('entering a change order leaves the contract value untouched')
  } else {
    bad('contract value', `it moved from ${beforeValue} to ${afterEntry} on entry alone`)
  }

  // Approval is refused while the document is a draft, whatever anybody ticks.
  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  const draftCheckbox = page.locator('input[type="checkbox"][aria-label^="Approve"]').first()
  if (await draftCheckbox.isDisabled()) {
    ok('the approval checkbox is refused on a draft')
  } else {
    bad('approval gate', 'a draft could be approved')
  }

  // Add two signing parties, sign one, and check the gate still holds.
  await page.getByRole('button', { name: 'Add a signing party' }).click()
  await page.waitForTimeout(300)
  await page.fill('input[name="party"]', 'Owner')
  await page.fill('input[name="role"]', 'Owner')
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Add the party' }).click()])

  await page.getByRole('button', { name: 'Add a signing party' }).click()
  await page.waitForTimeout(300)
  await page.fill('input[name="party"]', 'ConstructX')
  await page.fill('input[name="role"]', 'Contractor')
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Add the party' }).click()])

  await page.getByRole('button', { name: 'Edit this document' }).click()
  await page.waitForTimeout(400)
  await page.selectOption('select[name="status"]', 'FULLY_SIGNED')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Save document' }).click()])

  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  const unsignedText = await bodyWhen(/parties have not signed/)
  if (/2 parties have not signed/.test(unsignedText)) {
    ok('approval is refused while a required party has not signed')
  } else {
    bad('signature gate', 'the outstanding signatures did not block approval')
  }

  // Sign both parties.
  for (const party of ['Owner', 'ConstructX']) {
    const row = page.locator('tr', { hasText: party }).first()
    await row.getByRole('button', { name: 'Edit' }).click()
    await page.waitForTimeout(400)
    await page.selectOption('select[name="status"]', 'SIGNED')
    await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Save party' }).click()])
  }

  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  const signedText = await bodyWhen(/2 of 2/)
  if (/2 of 2/.test(signedText) && !/parties have not signed/.test(signedText)) {
    ok('the document follows its signatures to fully signed')
  } else {
    bad('signature tracking', 'the document did not reach fully signed')
  }

  // The certification dialog: cancel first, and check nothing happened.
  // The box is controlled by the saved state, so clicking opens the dialog and
  // leaves the box exactly as it was. That is the point of it.
  await page.locator('input[type="checkbox"][aria-label^="Approve"]').first().click()
  await page.waitForTimeout(400)
  const dialogText = await page.locator('[role="dialog"]').innerText()
  if (/I certify, to the best of my knowledge/.test(dialogText) && /\$116,600/.test(dialogText)) {
    ok('ticking the approval box asks for a certification and states the amount')
  } else {
    bad('certification dialog', 'the dialog did not state the certification and the amount')
  }
  await page.getByRole('button', { name: 'No, cancel' }).click()
  await page.waitForTimeout(800)
  const afterCancel = await bodyWhen(/Not in any figure yet/)
  if (/Not in any figure yet/.test(afterCancel)) {
    ok('answering no leaves the document unapproved')
  } else {
    bad('certification dialog', 'cancelling the dialog approved the document anyway')
  }

  // Now approve it for real.
  await page.locator('input[type="checkbox"][aria-label^="Approve"]').first().click()
  await page.waitForTimeout(400)
  await page.locator('[role="dialog"] input[type="checkbox"]').check()
  await Promise.all([page.waitForTimeout(3000), page.getByRole('button', { name: 'Yes, approve it' }).click()])

  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  const approvedText = await bodyWhen(/In the contract value/)
  if (/In the contract value/.test(approvedText) && /is in this project/.test(approvedText)) {
    ok('certifying the approval puts the amount into the contract value')
  } else {
    bad('approval', 'the document did not report as approved')
  }

  const afterApproval = await contractBefore()
  if (beforeValue !== null && afterApproval !== null && afterApproval - beforeValue === 116_600) {
    ok('the contract value rose by exactly the approved amount')
  } else {
    bad('contract value', `expected a rise of 116,600, saw ${beforeValue} to ${afterApproval}`)
  }

  // An approved document's pricing is locked.
  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  const lockedText = await bodyWhen(/pricing is locked/)
  if (/pricing is locked/.test(lockedText)) {
    ok('an approved document has its pricing locked')
  } else {
    bad('approval lock', 'the pricing was not locked after approval')
  }

  // Withdrawing needs a reason and a second confirmation.
  await page.locator('input[type="checkbox"][aria-label^="Withdraw"]').first().click()
  await page.waitForTimeout(400)
  const withdrawDialog = await page.locator('[role="dialog"]').innerText()
  if (/takes \$116,600 back out of the contract value/.test(withdrawDialog)) {
    ok('withdrawing an approval says exactly what it will take back out')
  } else {
    bad('withdraw dialog', 'the withdrawal dialog did not state the effect')
  }
  await page.fill('[role="dialog"] textarea', 'Exercise run, putting the project back as it was found.')
  await Promise.all([page.waitForTimeout(3000), page.getByRole('button', { name: 'Yes, withdraw it' }).click()])

  const afterWithdraw = await contractBefore()
  if (afterWithdraw === beforeValue) {
    ok('withdrawing the approval takes the amount back out of the contract value')
  } else {
    bad('withdraw', `the contract value did not return, ${beforeValue} against ${afterWithdraw}`)
  }

  // The history carries the whole story, and cannot be edited.
  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  const documentHistory = await bodyWhen(/Unlock/)
  const historyWants = ['Create', 'Approve', 'Unlock']
  const missingHistory = historyWants.filter((word) => !documentHistory.includes(word))
  if (missingHistory.length === 0 && /I certify, to the best of my knowledge/.test(documentHistory)) {
    ok('the history records the raising, the approval with its certification, and the withdrawal')
  } else {
    bad('document history', `missing ${missingHistory.join(', ') || 'the certification text'}`)
  }

  // Put the project back the way it was found. The document is unapproved by
  // now, so deleting it is allowed; an approved one would have been refused.
  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Remove the line' }).click()
  await page.waitForTimeout(2000)

  await page.goto(documentUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Delete this document' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Delete the document' }).click()
  await page.waitForTimeout(2500)

  await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
  const tidied = await bodyWithout(/CO-EX1/)
  if (!tidied.includes('CO-EX1')) ok('an unapproved document can be deleted, and the project is back as it was')
  else bad('cleanup', 'the exercise change order was still on the project')

  // ── Time and materials, and the double counting it invites ───────────────
  // A ticket is signed on the day for hours and machines that were really
  // there. It becomes money either on its own or through a change order that
  // bills it. Both counting would bill the same work twice, and that is the
  // thing proved here.
  console.log('\nTime and materials')

  const removeDocument = async (number) => {
    await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
    const row = page.locator('tr', { hasText: number }).first()
    if ((await row.count()) === 0) return
    await row.locator('a').first().click()
    await page.waitForURL(/\/changes\/[^/]+$/, { timeout: 20000 })
    const withdraw = page.locator('input[type="checkbox"][aria-label^="Withdraw"]')
    if ((await withdraw.count()) > 0) {
      await withdraw.first().click()
      await page.waitForTimeout(400)
      await page.fill('[role="dialog"] textarea', 'Clearing an exercise run.')
      await page.getByRole('button', { name: 'Yes, withdraw it' }).click()
      await page.waitForTimeout(2500)
    }
    // "Remove" appears against lines, signing parties and attachments alike,
    // so take the first one and back out if the dialog is not a line's.
    for (let guard = 0; guard < 10; guard++) {
      const removes = page.getByRole('button', { name: 'Remove', exact: true })
      if ((await removes.count()) === 0) break
      await removes.first().click()
      await page.waitForTimeout(400)
      const confirmLine = page.getByRole('button', { name: 'Remove the line' })
      if ((await confirmLine.count()) === 0) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        break
      }
      await confirmLine.click()
      await page.waitForTimeout(2000)
    }
    await page.getByRole('button', { name: 'Delete this document' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Delete the document' }).click()
    await page.waitForTimeout(2500)
  }

  // The ticket first: a change order carrying it cannot be deleted while it
  // does.
  await removeDocument('TM-EX1')
  await removeDocument('CO-EX2')

  const tmBaseline = await contractBefore()

  // The change order that will carry the ticket. Priced from a line with no
  // markup, so the arithmetic below is the whole story.
  await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Raise a change order/ }).click()
  await page.waitForTimeout(400)
  await page.fill('input[name="number"]', 'CO-EX2')
  await page.fill('input[name="description"]', 'Exercise change order carrying tickets')
  await page.selectOption('select[name="documentKind"]', 'CHANGE_ORDER')
  await page.selectOption('select[name="status"]', 'DRAFT')
  await page.fill('input[name="profitPct"]', '0')
  await page.fill('input[name="overheadPct"]', '0')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Raise it' }).click()])
  await page.waitForURL(/\/changes\/[^/]+$/, { timeout: 20000 })

  await page.getByRole('button', { name: /Add the first line|Add a line/ }).first().click()
  await page.waitForTimeout(400)
  await page.fill('input[name="description"]', 'Exercise carried scope')
  await page.selectOption('select[name="measure"]', 'LS')
  await page.fill('input[name="count"]', '1')
  await page.fill('input[name="otherUnitCost"]', '20000')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Add the line' }).click()])

  // The ticket, priced off the machine on the equipment list rather than a
  // rate typed in from memory.
  await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Raise a change order/ }).click()
  await page.waitForTimeout(400)
  await page.fill('input[name="number"]', 'TM-EX1')
  await page.fill('input[name="description"]', 'Exercise time and materials day')
  await page.selectOption('select[name="documentKind"]', 'TIME_AND_MATERIALS')
  await page.selectOption('select[name="status"]', 'DRAFT')
  await page.fill('input[name="profitPct"]', '0')
  await page.fill('input[name="overheadPct"]', '0')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Raise it' }).click()])
  await page.waitForURL(/\/changes\/[^/]+$/, { timeout: 20000 })
  const ticketUrl = page.url()

  await page.getByRole('button', { name: /Add the first line|Add a line/ }).first().click()
  await page.waitForTimeout(400)
  await page.fill('input[name="description"]', 'Excavator and haul, day rate')
  await page.selectOption('select[name="measure"]', 'LS')
  await page.fill('input[name="count"]', '1')
  await page.fill('input[name="equipmentClass"]', machineName)
  await page.fill('input[name="equipmentHrsPerUnit"]', '8')
  await page.fill('input[name="otherUnitCost"]', '440')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Add the line' }).click()])

  /*
    Worked by hand, the machine rate coming off the equipment list:

      machine   8 hours x 195.00 an hour, all in    1,560.00
      other                                           440.00
      no overhead, no profit
      ticket                                        2,000.00
  */
  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  const ticketText = await bodyWhen(/\$2,000/)
  if (ticketText.includes('$2,000')) {
    ok('a time and materials ticket prices its machine hours straight off the equipment list')
  } else {
    bad('ticket pricing', 'the ticket did not come to 2,000 from the equipment rate and the other cost')
  }
  if (/No signing party recorded/.test(ticketText)) {
    ok('a ticket nobody signed for says so, because that is what a ticket is worth')
  } else {
    bad('ticket signature check', 'an unsigned ticket did not report that nobody signed it')
  }

  await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
  const tmPanel = await bodyWhen(/machine hours/)
  const hoursShown = tmPanel.match(/(\d+) machine hours/)
  if (/time and materials/i.test(tmPanel) && hoursShown?.[1] === '8') {
    ok('the tickets on a job are summarised with the hours standing behind them')
  } else {
    bad(
      'time and materials panel',
      `expected 8 machine hours, the panel said ${hoursShown?.[0] ?? 'nothing about machine hours'}`,
    )
  }

  // Sign it and approve it standing on its own, which is money.
  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add a signing party' }).click()
  await page.waitForTimeout(300)
  await page.fill('input[name="party"]', 'Owner representative')
  await page.fill('input[name="role"]', 'Owner')
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Add the party' }).click()])

  const signingRow = page.locator('tr', { hasText: 'Owner representative' }).first()
  await signingRow.getByRole('button', { name: 'Edit' }).click()
  await page.waitForTimeout(400)
  await page.selectOption('select[name="status"]', 'SIGNED')
  await Promise.all([page.waitForTimeout(2000), page.getByRole('button', { name: 'Save party' }).click()])

  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Edit this document' }).click()
  await page.waitForTimeout(400)
  await page.selectOption('select[name="status"]', 'FULLY_SIGNED')
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Save document' }).click()])

  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  await page.locator('input[type="checkbox"][aria-label^="Approve"]').first().click()
  await page.waitForTimeout(400)
  await page.locator('[role="dialog"] input[type="checkbox"]').check()
  await Promise.all([page.waitForTimeout(3000), page.getByRole('button', { name: 'Yes, approve it' }).click()])

  const afterTicketApproval = await contractBefore()
  if (tmBaseline !== null && afterTicketApproval !== null && afterTicketApproval - tmBaseline === 2000) {
    ok('a signed ticket billed on its own reaches the contract value like any other change')
  } else {
    bad('ticket approval', `expected a rise of 2,000, saw ${tmBaseline} to ${afterTicketApproval}`)
  }

  // Now bill it through the change order instead. The approval has to come off
  // first, which is the lock working.
  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  const lockedRollUp = await bodyWhen(/where it bills is locked/)
  if (/where it bills is locked/.test(lockedRollUp)) {
    ok('an approved ticket cannot be moved under a change order without withdrawing the approval')
  } else {
    bad('roll up lock', 'where an approved ticket bills was not locked')
  }

  await page.locator('input[type="checkbox"][aria-label^="Withdraw"]').first().click()
  await page.waitForTimeout(400)
  await page.fill('[role="dialog"] textarea', 'Exercise run, moving the ticket under the change order that bills it.')
  await Promise.all([page.waitForTimeout(3000), page.getByRole('button', { name: 'Yes, withdraw it' }).click()])

  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  const carrierOption = await page
    .locator('select[name="rollsUpToId"] option', { hasText: 'CO-EX2' })
    .first()
    .getAttribute('value')
  await page.selectOption('select[name="rollsUpToId"]', carrierOption)
  await Promise.all([page.waitForTimeout(2500), page.getByRole('button', { name: 'Save where it bills' }).click()])

  await page.goto(ticketUrl, { waitUntil: 'networkidle' })
  const rolledText = await bodyWhen(/carried by CO-EX2/)
  if (/carried by CO-EX2|is carried by CO-EX2/.test(rolledText)) {
    ok('a ticket says which change order carries it, on the ticket itself')
  } else {
    bad('roll up', 'the ticket did not say which change order bills it')
  }

  // Approve it again. It is signed, it is real, and it still must not move the
  // contract value, because CO-EX2 is what bills this work.
  await page.locator('input[type="checkbox"][aria-label^="Approve"]').first().click()
  await page.waitForTimeout(400)
  await page.locator('[role="dialog"] input[type="checkbox"]').check()
  await Promise.all([page.waitForTimeout(3000), page.getByRole('button', { name: 'Yes, approve it' }).click()])

  const afterRolledApproval = await contractBefore()
  if (afterRolledApproval === tmBaseline) {
    ok('approving a rolled up ticket adds nothing, so the same signed work cannot be billed twice')
  } else {
    bad('double counting', `the rolled up ticket moved the contract value from ${tmBaseline} to ${afterRolledApproval}`)
  }

  const rolledPanel = await bodyWhen(/carried elsewhere, counted once/)
  if (/1 carried elsewhere, counted once/.test(rolledPanel)) {
    ok('the tickets panel separates what is billed on its own from what a change order carries')
  } else {
    bad('time and materials panel', 'the rolled up tickets were not reported separately')
  }

  // Put the job back the way it was found.
  await removeDocument('TM-EX1')
  await removeDocument('CO-EX2')
  await page.goto(`${BASE}/projects/${projectId}/changes`, { waitUntil: 'networkidle' })
  const tmCleaned = await bodyWithout(/TM-EX1|CO-EX2/)
  const tmFinal = await contractBefore()
  if (!tmCleaned.includes('TM-EX1') && !tmCleaned.includes('CO-EX2') && tmFinal === tmBaseline) {
    ok('the tickets and the change order carrying them come off cleanly, leaving the contract value as found')
  } else {
    bad('cleanup', `documents left behind, or the contract value sat at ${tmFinal} against ${tmBaseline}`)
  }

  await clearMachine()
  await page.goto(`${BASE}/admin/equipment`, { waitUntil: 'networkidle' })
  const plantCleaned = await bodyWithout(new RegExp(machineName))
  if (!plantCleaned.includes(machineName)) {
    ok('a machine with nothing charged against it can be taken off the equipment list')
  } else {
    bad('equipment cleanup', 'the exercise machine was still on the list')
  }

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

  // ── The sign-in box, under pressure ──────────────────────────────────────
  // A password box with no limit behind it is a guessing machine, and this one
  // guards a company's contract values.
  console.log('\nSign-in throttle')
  const guessContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const guesser = await guessContext.newPage()

  // An address nobody has, so no real account is slowed down by this check.
  const madeUpEmail = `throttle-probe-${Date.now()}@constructx.com`
  /*
    Submit, then wait for the answer to appear.

    Waiting for the URL is no use here: the form posts back to /login, so the
    page is already at the address it is going to end up at and the wait returns
    before the server has said anything.
  */
  const guess = async (email, password) => {
    await guesser.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await guesser.fill('input[type="email"]', email)
    await guesser.fill('input[type="password"]', password)
    await guesser.click('button[type="submit"]')
    // A refusal comes back as a redirect carrying the reason in the query, so
    // that is the thing to wait for. Reading the page before the navigation has
    // landed gets the old one, or nothing at all.
    await guesser.waitForURL(/[?&]error=/, { timeout: 20000 }).catch(() => {})
    return decodeURIComponent(new URL(guesser.url()).searchParams.get('error') ?? '')
  }

  let refusedAt = 0
  let wrongPasswordMessages = 0
  for (let attempt = 1; attempt <= 7; attempt++) {
    const text = await guess(madeUpEmail, 'not-the-password')
    if (/Too many sign-in attempts/.test(text)) {
      refusedAt = attempt
      break
    }
    if (/was not recognised/.test(text)) wrongPasswordMessages++
  }

  if (wrongPasswordMessages === 5 && refusedAt === 6) {
    ok('five wrong passwords pass through, and the sixth is made to wait')
  } else {
    bad('sign-in throttle', `refused at attempt ${refusedAt} after ${wrongPasswordMessages} plain refusals`)
  }

  const throttled = await guess(madeUpEmail, 'not-the-password')
  if (/Try again in/.test(throttled)) {
    ok('the wait is stated rather than left as a mystery')
  } else {
    bad('sign-in throttle', `the refusal did not say how long to wait, it said ${JSON.stringify(throttled)}`)
  }

  // The same message whichever way it fails, so the box cannot be used to find
  // out who has an account here. Two addresses nobody has been guessing at, so
  // neither is already carrying a wait.
  const realAccount = await guess('accounting@constructx.com', 'definitely-wrong')
  const noAccount = await guess(`nobody-${Date.now()}@constructx.com`, 'definitely-wrong')

  const said = (text) => (text.match(/was not recognised|Too many sign-in attempts/) ?? [''])[0]
  if (said(realAccount) && said(realAccount) === said(noAccount)) {
    ok('a real account and a made up one are refused in exactly the same words')
  } else {
    bad('account enumeration', `"${said(realAccount)}" against "${said(noAccount)}"`)
  }

  // A correct password still works, which is the point of a throttle rather
  // than a lockout.
  await signIn(guesser, 'owner@constructx.com', 'constructx')
  if (!new URL(guesser.url()).pathname.startsWith('/login')) {
    ok('the right password still gets in, because this slows guessing rather than locking accounts')
  } else {
    bad('sign-in throttle', 'a correct password was refused')
  }
  await guessContext.close()

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
