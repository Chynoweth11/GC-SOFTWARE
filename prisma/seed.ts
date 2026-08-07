/**
 * Seeds ConstructX from the three source workbooks.
 *
 * `seed-data.json` is a faithful extraction of every populated row in
 * ConstructX_Project_Controls_WorkbookXX.xlsx, ConstructX_Master_Company_TrackingX.xlsx
 * and ConstructX_Takeoff_Bid_Template2.xlsx, so the seeded system reproduces the
 * spreadsheets it replaces and every figure on screen can be checked against them.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient, type CostCategory, type Prisma } from '../src/generated/prisma/client'
import { COUNTIES, JURISDICTIONS } from '../src/lib/reference/jurisdictions'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

type Row = Record<string, string | number | boolean | null>
/**
 * The workbooks were written in Word-styled prose, so the extraction carries em
 * dashes, en dashes and ellipses. This software does not use them anywhere, so
 * every incoming string is normalised once as the file is read rather than at
 * each of the hundred places the data is used.
 */
function normaliseText(value: string): string {
  return value
    .replace(/ \u2014 /g, ', ')
    .replace(/\u2014 /g, '')
    .replace(/ \u2014/g, '')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
}

function normaliseDeep(value: unknown): unknown {
  if (typeof value === 'string') return normaliseText(value)
  if (Array.isArray(value)) return value.map(normaliseDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normaliseDeep(entry)]))
  }
  return value
}

const raw = normaliseDeep(
  JSON.parse(readFileSync(join(process.cwd(), 'prisma', 'seed-data.json'), 'utf8')),
) as Record<string, Row[]>

// ── helpers ───────────────────────────────────────────────────────────────
const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const d = (v: unknown): Date | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null)
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/**
 * Puts a lump sum into the cost bucket its cost type belongs to.
 *
 * A change order line prices like a takeoff line, which means the money has to
 * be in the right bucket for the cost mix to be true. A labor lump sum becomes
 * one hour at that rate, which is the same money said in the fields that exist.
 */
function unitCostForCategory(category: CostCategory, amount: number) {
  switch (category) {
    case 'LABOR':
      return { laborHrsPerUnit: 1, laborRateOverride: amount }
    case 'MATERIAL':
      return { materialUnitCost: amount }
    case 'EQUIPMENT':
      return { equipmentUnitCost: amount }
    case 'SUBCONTRACT':
      return { subUnitCost: amount }
    default:
      return { otherUnitCost: amount }
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`
}

// ── reference data ────────────────────────────────────────────────────────

const DIVISIONS: [string, string][] = [
  ['01', 'General Requirements'],
  ['02', 'Existing Conditions / Demolition'],
  ['03', 'Concrete'],
  ['04', 'Masonry'],
  ['05', 'Metals'],
  ['06', 'Wood, Plastics & Composites'],
  ['07', 'Thermal & Moisture Protection'],
  ['08', 'Openings'],
  ['09', 'Finishes'],
  ['10', 'Specialties'],
  ['11', 'Equipment'],
  ['12', 'Furnishings'],
  ['14', 'Conveying Equipment'],
  ['21', 'Fire Suppression'],
  ['22', 'Plumbing'],
  ['23', 'HVAC'],
  ['26', 'Electrical'],
  ['27', 'Communications / Low Voltage'],
  ['31', 'Earthwork'],
  ['32', 'Exterior Improvements'],
  ['33', 'Utilities'],
]

/** Trades from Lists!A5:A36, extended with the scope breakdown the brief calls for. */
const TRADES: [string, string][] = [
  ['General Conditions', '01'],
  ['Demolition', '02'],
  ['Existing Conditions', '02'],
  ['Earthwork / Excavation', '31'],
  ['Site Utilities', '33'],
  ['Storm Drainage', '33'],
  ['Sanitary Sewer', '33'],
  ['Domestic Water', '33'],
  ['Concrete: Foundations', '03'],
  ['Concrete: Footings', '03'],
  ['Concrete: Foundation Walls', '03'],
  ['Concrete: Slabs', '03'],
  ['Concrete: Flatwork', '03'],
  ['Cast-in-Place Concrete', '03'],
  ['Masonry', '04'],
  ['Structural Steel', '05'],
  ['Metal Framing', '05'],
  ['Rough Carpentry / Framing', '06'],
  ['Wood Framing', '06'],
  ['Finish Carpentry', '06'],
  ['Millwork / Casework', '06'],
  ['Countertops', '12'],
  ['Waterproofing', '07'],
  ['Insulation', '07'],
  ['Roofing', '07'],
  ['Siding / Cladding', '07'],
  ['Doors, Frames & Hardware', '08'],
  ['Glass & Glazing', '08'],
  ['Drywall', '09'],
  ['Tile & Stone', '09'],
  ['Tile: Floors', '09'],
  ['Tile: Shower Walls', '09'],
  ['Tile: Shower Pans', '09'],
  ['Flooring', '09'],
  ['Painting', '09'],
  ['Specialties', '10'],
  ['Appliances / Equipment', '11'],
  ['Fire Protection', '21'],
  ['Plumbing', '22'],
  ['HVAC', '23'],
  ['Electrical', '26'],
  ['Low Voltage / AV', '27'],
  ['Elevator', '14'],
  ['Landscaping / Irrigation', '32'],
  ['Site Improvements', '32'],
  ['Paving & Striping', '32'],
  ['Final Clean', '01'],
]

/** Maps a workbook cost-code prefix to its CSI division. */
function divisionForCode(code: string): string {
  const prefix = code.slice(0, 2)
  const map: Record<string, string> = {
    '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
    '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12',
    '15': '23', '16': '26', '98': '01', '99': '01',
  }
  return map[prefix] ?? '01'
}

const CATEGORY_MAP: Record<string, CostCategory> = {
  Labor: 'LABOR',
  Material: 'MATERIAL',
  Equipment: 'EQUIPMENT',
  Subcontract: 'SUBCONTRACT',
  'General Conditions': 'GENERAL_CONDITIONS',
  Overhead: 'OVERHEAD',
  Contingency: 'CONTINGENCY',
  Other: 'OTHER',
}

const BID_STATUS_MAP: Record<string, string> = {
  Lead: 'LEAD',
  Qualifying: 'QUALIFYING',
  Estimating: 'ESTIMATING',
  Submitted: 'SUBMITTED',
  'Pending Decision': 'PENDING_DECISION',
  'On Hold': 'ON_HOLD',
  Won: 'WON',
  Lost: 'LOST',
  'No Bid': 'NO_BID',
  Withdrawn: 'WITHDRAWN',
}

const CLIENT_TYPE_MAP: Record<string, string> = {
  Residential: 'RESIDENTIAL',
  Commercial: 'COMMERCIAL',
  'Public / Bid': 'PUBLIC',
  'Repeat Client': 'COMMERCIAL',
  Developer: 'DEVELOPER',
  Institutional: 'INSTITUTIONAL',
}

const PROJECT_STATUS_MAP: Record<string, string> = {
  Active: 'ACTIVE',
  Bidding: 'BIDDING',
  Awarded: 'AWARDED',
  Preconstruction: 'PRECONSTRUCTION',
  'Under Construction': 'UNDER_CONSTRUCTION',
  Closeout: 'COMPLETED',
  'Substantially Complete': 'COMPLETED',
  Complete: 'COMPLETED',
  Closed: 'CLOSED',
  'On Hold': 'ON_HOLD',
}

/**
 * The workbook's change order statuses, mapped onto the document journey.
 *
 * The workbook mixed up where a document was in review with whether it had been
 * approved. Here they are separate: the status says where it is, and a separate
 * approval decides whether its money counts. Approved and executed rows are
 * seeded with an approval so the seeded contract values still match the
 * workbook's own figures.
 */
const CO_STATUS_MAP: Record<string, string> = {
  Draft: 'DRAFT',
  Pricing: 'INTERNAL_REVIEW',
  Pending: 'READY_TO_SEND',
  Submitted: 'SENT_FOR_SIGNATURE',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
  Void: 'VOIDED',
  Executed: 'APPROVED',
}

/** The workbook statuses that mean the document was signed and approved. */
const CO_APPROVED_IN_WORKBOOK = new Set(['Approved', 'Executed'])

const CO_TYPE_MAP: Record<string, string> = {
  'Owner Request': 'OWNER_REQUEST',
  'Design Change': 'DESIGN_CHANGE',
  'Field Condition': 'FIELD_CONDITION',
  'Allowance Reconcile': 'ALLOWANCE_RECONCILE',
  'ASI-Driven': 'ASI_DRIVEN',
  Backcharge: 'BACKCHARGE',
  'Time Only': 'TIME_ONLY',
}

const PO_STATUS_MAP: Record<string, string> = {
  Issued: 'ISSUED',
  'Partially Received': 'PARTIALLY_RECEIVED',
  Received: 'RECEIVED',
  Invoiced: 'INVOICED',
  Closed: 'CLOSED',
  Cancelled: 'CANCELLED',
}

const MEASURE_MAP: Record<string, string> = {
  EA: 'EA', LF: 'LF', SF: 'SF', SY: 'SY', CY: 'CY', CF: 'CF',
  TON: 'TON', LB: 'LB', HR: 'HR', DAY: 'DAY', LS: 'LS', GAL: 'EA', MO: 'DAY', RISER: 'EA',
}

// ── seed ──────────────────────────────────────────────────────────────────

/**
 * Rebuilds the database from the workbooks.
 *
 * Seeding destroys and recreates every table, so the append-only guards on the
 * audit history have to come off for the duration and go straight back on. This
 * is not an edit to a live history: nothing the old entries referred to survives
 * the rebuild. The guards are reinstated before the function returns, and
 * `src/lib/db.ts` reinstates them again on every boot, so a seed that dies
 * halfway through still leaves the history protected.
 */
async function withAuditGuardsLifted<T>(run: () => Promise<T>): Promise<T> {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_log_is_append_only_update')
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_log_is_append_only_delete')
  try {
    return await run()
  } finally {
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_update
       BEFORE UPDATE ON "AuditLog"
       BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be modified.'); END`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_delete
       BEFORE DELETE ON "AuditLog"
       BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be deleted.'); END`,
    )
  }
}

async function main() {
  console.log('Clearing existing data...')
  const tables = [
    'session', 'projectSnapshot', 'quantityEntry', 'quantityItem',
    'cashFlowPeriod', 'forecastLine', 'forecastPeriod', 'ownerBillingLine', 'ownerBilling',
    'sovLine', 'subInvoice', 'costTransaction', 'changeOrderLine', 'changeOrder',
    'commitmentChange', 'commitmentLine', 'commitment', 'budgetRevision', 'budgetLine',
    'bidPackageQuote', 'bidPackage', 'estimateClarification', 'estimateAlternate',
    'generalConditionItem', 'estimateItem', 'estimateSection', 'laborRate', 'laborClassification',
    'complianceSubmission', 'complianceRequirement', 'projectLaborAssignment',
    'projectEquipmentAssignment', 'equipmentItem', 'overheadCost',
    'wageRateLine', 'wageRateSheet', 'payrollCounty', 'payrollJurisdiction',
    'project', 'estimate', 'bid', 'vendor', 'vendorRegion', 'vendorState', 'client', 'costCode', 'trade', 'csiDivision',
    'arAgingBucket', 'companyMonthly', 'user', 'company',
  ] as const
  await withAuditGuardsLifted(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "AuditLog"')
  })
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[t].deleteMany({})
  }

  // ── Company and users ───────────────────────────────────────────────────
  const company = await prisma.company.create({
    data: {
      name: 'ConstructX',
      legalName: 'ConstructX General Contractors, LLC',
      city: 'Richland',
      state: 'WA',
      targetMarginPct: 0.16,
      defaultRetentionPct: 0.05,
      defaultLaborBurdenPct: 0.34,
      defaultOverheadPct: 0.06,
    },
  })

  const users = await Promise.all(
    (
      [
        ['owner@constructx.com', 'Owen Chynoweth', 'OWNER'],
        ['exec@constructx.com', 'Dana Whitfield', 'EXECUTIVE'],
        ['o.reed@constructx.com', 'O. Reed', 'PROJECT_MANAGER'],
        ['j.whitlock@constructx.com', 'J. Whitlock', 'PROJECT_MANAGER'],
        ['engineer@constructx.com', 'P. Nakamura', 'PROJECT_ENGINEER'],
        ['estimator@constructx.com', 'L. Aguilar', 'ESTIMATOR'],
        ['accounting@constructx.com', 'R. Osei', 'ACCOUNTING'],
        ['finance@constructx.com', 'M. Salcedo', 'FINANCE'],
        ['viewer@constructx.com', 'Read Only', 'READ_ONLY'],
      ] as const
    ).map(([email, name, role]) =>
      prisma.user.create({
        data: { companyId: company.id, email, name, role, passwordHash: hashPassword('constructx') },
      }),
    ),
  )
  const userByName = new Map(users.map((u) => [u.name, u]))

  // ── Divisions, trades, cost codes ───────────────────────────────────────
  const divisions = await Promise.all(
    DIVISIONS.map(([code, name], i) =>
      prisma.csiDivision.create({ data: { companyId: company.id, code, name, sortOrder: i } }),
    ),
  )
  const divisionByCode = new Map(divisions.map((x) => [x.code, x]))

  const trades = await Promise.all(
    TRADES.map(([name, divCode], i) =>
      prisma.trade.create({
        data: { companyId: company.id, name, divisionId: divisionByCode.get(divCode)?.id, sortOrder: i },
      }),
    ),
  )
  const tradeByName = new Map(trades.map((t) => [t.name, t]))

  // Cost codes come from the Financials tab, plus the codes the POs reference.
  const codeSpecs = new Map<string, { description: string; category: CostCategory; trade: string | null }>()
  for (const row of raw.financials) {
    const code = String(row['Cost Code'])
    codeSpecs.set(code, {
      description: String(row['Description'] ?? code),
      category: CATEGORY_MAP[String(row['Category'])] ?? 'OTHER',
      trade: s(row['Trade / Scope']),
    })
  }
  for (const row of raw.purchaseOrders) {
    const code = String(row['Cost Code'])
    if (!codeSpecs.has(code)) {
      codeSpecs.set(code, {
        description: String(row['Description'] ?? code),
        category: 'MATERIAL',
        trade: s(row['Trade / Scope']),
      })
    }
  }

  const costCodes = await Promise.all(
    [...codeSpecs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, spec], i) =>
        prisma.costCode.create({
          data: {
            companyId: company.id,
            code,
            description: spec.description,
            category: spec.category,
            divisionId: divisionByCode.get(divisionForCode(code))?.id,
            tradeId: spec.trade ? tradeByName.get(spec.trade)?.id : undefined,
            sortOrder: i,
          },
        }),
      ),
  )
  const codeByCode = new Map(costCodes.map((c) => [c.code, c]))

  // ── Clients ─────────────────────────────────────────────────────────────
  const clientNames = new Map<string, string>()
  for (const row of raw.projectSummary) {
    const name = s(row['Client'])
    if (name) clientNames.set(name, 'OTHER')
  }
  for (const row of raw.bidPipeline) {
    const name = s(row['Client / Contact'])
    if (name) clientNames.set(name, CLIENT_TYPE_MAP[String(row['Client Type'])] ?? 'OTHER')
  }

  const clients = await Promise.all(
    [...clientNames.entries()].map(([name, type]) =>
      prisma.client.create({
        data: { companyId: company.id, name, type: type as never },
      }),
    ),
  )
  const clientByName = new Map(clients.map((c) => [c.name, c]))

  // ── Vendors (subcontractors from the project workbook, bidders from both) ──
  const vendorSpecs = new Map<string, Row>()
  for (const row of raw.subcontractors) vendorSpecs.set(String(row['Company Name']), row)
  const extraVendorNames = new Set<string>()
  for (const row of raw.bidLeveling) for (const k of ['Bidder A', 'Bidder B', 'Bidder C']) {
    const v = s(row[k])
    if (v) extraVendorNames.add(v)
  }
  for (const row of raw.subQuotes) for (const k of ['Bidder A', 'Bidder B', 'Bidder C']) {
    const v = s(row[k])
    if (v) extraVendorNames.add(v)
  }
  for (const row of raw.purchaseOrders) {
    const v = s(row['Vendor'])
    if (v) extraVendorNames.add(v)
  }

  // ── Vendor geography ────────────────────────────────────────────────────
  // The states and regions the company works in. This is a starting set: every
  // name here can be renamed, added to, or removed in Settings, and vendors are
  // left unfiled so the team files them the way they actually work.
  const GEOGRAPHY: [string, string, string[]][] = [
    ['Washington', 'WA', ['Tri-Cities', 'Seattle Area', 'Spokane Area', 'Central Washington']],
    ['Colorado', 'CO', ['Vail Valley', 'Denver Metro', 'Aspen and Roaring Fork Valley', 'Colorado Springs']],
  ]
  for (const [stateIndex, [stateName, stateCode, regionNames]] of GEOGRAPHY.entries()) {
    const state = await prisma.vendorState.create({
      data: { companyId: company.id, name: stateName, code: stateCode, sortOrder: stateIndex },
    })
    for (const [regionIndex, regionName] of regionNames.entries()) {
      await prisma.vendorRegion.create({
        data: { companyId: company.id, stateId: state.id, name: regionName, sortOrder: regionIndex },
      })
    }
  }

  // ── Payroll jurisdictions ───────────────────────────────────────────────
  // All fifty states and the District of Columbia, so a prevailing wage sheet
  // can be built for work anywhere without waiting on someone to add the state
  // first. What is seeded is only what is true of the state itself: the name,
  // the code, how workers compensation is bought there, and who publishes the
  // determinations.
  //
  // No tax rate is seeded. The state unemployment rate is assigned per employer
  // per year, so every jurisdiction starts with no rate and unverified, and the
  // wage sheet says so on its face until somebody enters it from their own
  // annual notice. That is what the source form asks for in as many words.
  //
  // Counties come with Washington and Colorado complete, because that is where
  // this company builds and prevailing wage is determined county by county.
  // Everywhere else starts empty and counties are added as work reaches them.
  for (const [index, jurisdiction] of JURISDICTIONS.entries()) {
    const record = await prisma.payrollJurisdiction.create({
      data: {
        companyId: company.id,
        code: jurisdiction.code,
        name: jurisdiction.name,
        sutaPct: null,
        sutaWageBase: null,
        sutaRateYear: null,
        workersCompBasis: jurisdiction.perHourWorkersComp ? 'PER_HOUR' : 'PER_100_PAYROLL',
        stateFund: jurisdiction.stateFund ?? false,
        wageAuthority: jurisdiction.wageAuthority ?? null,
        notes: jurisdiction.notes ?? null,
        sortOrder: index,
      },
    })

    const counties = COUNTIES[jurisdiction.code] ?? []
    for (const [countyIndex, name] of counties.entries()) {
      await prisma.payrollCounty.create({
        data: { jurisdictionId: record.id, name, sortOrder: countyIndex },
      })
    }
  }

  const vendors: { id: string; name: string }[] = []
  for (const [name, row] of vendorSpecs) {
    const v = await prisma.vendor.create({
      data: {
        companyId: company.id,
        name,
        isSubcontractor: true,
        tradeId: tradeByName.get(String(row['Trade / Scope']))?.id,
        contactName: s(row['Contact Name']),
        phone: s(row['Phone']),
        email: s(row['Email']),
        address: s(row['Address']),
        w9OnFile: row['W-9 On File'] === 'Y',
        glExpiration: d(row['GL Insurance Exp.']),
        wcExpiration: d(row['Workers Comp Exp.']),
        autoExpiration: d(row['Auto Exp.']),
        umbrellaExpiration: d(row['Umbrella Exp.']),
        bondRequired: row['Bond Required'] === 'Y',
        bondStatus: s(row['Bond Status']),
        performanceRating: n(row['Performance Rating']) || null,
        safetyRating: n(row['Safety Rating']) || null,
        qualityRating: n(row['Quality Rating']) || null,
        scheduleRating: n(row['Schedule Rating']) || null,
        notes: s(row['Notes']),
      },
    })
    vendors.push(v)
  }
  for (const name of extraVendorNames) {
    if (vendorSpecs.has(name)) continue
    const isSub = !/lumber|truss|glass|supply|steel co/i.test(name) || /glass/i.test(name)
    const v = await prisma.vendor.create({
      data: { companyId: company.id, name, isSubcontractor: isSub },
    })
    vendors.push(v)
  }
  const vendorByName = new Map(vendors.map((v) => [v.name, v]))

  // ── Bid pipeline ────────────────────────────────────────────────────────
  const bids = await Promise.all(
    raw.bidPipeline.map((row) =>
      prisma.bid.create({
        data: {
          companyId: company.id,
          number: String(row['Bid #']),
          name: String(row['Project / Opportunity']),
          clientId: clientByName.get(String(row['Client / Contact']))?.id,
          clientContact: s(row['Client / Contact']),
          clientPhone: s(row['Phone / Email']),
          clientType: (CLIENT_TYPE_MAP[String(row['Client Type'])] ?? 'OTHER') as never,
          leadSource: s(row['Lead Source']),
          location: s(row['Location']),
          estimator: s(row['Estimator']),
          dateReceived: d(row['Date Received']),
          bidDue: d(row['Bid Due']),
          estimatedValue: n(row['Est. Value ($)']),
          submittedAmount: n(row['Bid Submitted ($)']),
          dateSubmitted: d(row['Date Submitted']),
          status: (BID_STATUS_MAP[String(row['Status'])] ?? 'LEAD') as never,
          winProbability: n(row['Win Prob %']),
          lastContact: d(row['Last Contact']),
          nextFollowUp: d(row['Next Follow-Up']),
          touches: n(row['Touches']),
          nextAction: s(row['Next Action']),
          decisionDate: d(row['Decision Date']),
          outcomeReason: s(row['Outcome Reason']),
          notes: s(row['Job # / Notes']),
        },
      }),
    ),
  )
  const bidByNumber = new Map(bids.map((b) => [b.number, b]))

  // ── Estimate from the takeoff workbook ──────────────────────────────────
  const estimate = await prisma.estimate.create({
    data: {
      companyId: company.id,
      bidId: bidByNumber.get('B-26-014')?.id,
      name: 'Riverview Office TI',
      version: 1,
      status: 'IN_PROGRESS',
      clientName: 'Riverview Partners LLC',
      architect: 'Vale + Stone Architects',
      address: '410 Riverview Dr, Kennewick WA',
      projectType: 'Commercial, Tenant Improvement',
      bidDueDate: D('2026-04-17'),
      estimator: 'O. Reed',
      drawingSet: 'Permit Set, 03/20/2026',
      addenda: '1, 2',
      durationWeeks: 22,
      buildingAreaSf: 8400,
      laborBurdenPct: 0.34,
      salesTaxPct: 0.086,
      smallToolsPct: 0.03,
      contingencyPct: 0.03,
      overheadPct: 0.06,
      profitPct: 0.1,
      glInsurancePct: 0.012,
      bondPct: 0.01,
      exciseTaxPct: 0.005,
      roundToNearest: 500,
    },
  })

  /*
    The estimate's own labor rates, exactly as the workbook carried them: bare
    wages, with the estimate's flat labor burden added on top of each. They stay
    unlinked so the seeded estimate still totals to the workbook's own figures.

    The same wages are seeded into the classification library below. Linking a
    class to the library is a deliberate act, because it swaps a flat burden
    percentage for a real one and moves the number.
  */
  const WORKBOOK_LABOR_RATES: [string, number][] = [
    ['Foreman', 68], ['Carpenter', 52], ['Laborer', 38],
    ['Operator', 62], ['Finisher', 55], ['PM/Super', 75],
  ]

  await prisma.laborRate.createMany({
    data: WORKBOOK_LABOR_RATES.map(([className, rate], i) => ({
      estimateId: estimate.id,
      className,
      rate,
      sortOrder: i,
    })),
  })

  /*
    The classification library, started from the wages the takeoff already
    prices at, so the list is real on the first day rather than empty.

    Fringe, training and workers compensation are left at zero, and each
    classification says so on its face, because those are specific to this firm
    and its risk classes and no list shipped with software can know them. The
    salaried side of the list is left empty for the same reason: a salary is not
    something to guess at.
  */
  for (const [index, [className, wage]] of WORKBOOK_LABOR_RATES.entries()) {
    await prisma.laborClassification.create({
      data: {
        companyId: company.id,
        name: className,
        kind: className === 'PM/Super' ? 'STAFF' : 'FIELD',
        payBasis: 'HOURLY',
        baseAmount: wage,
        benefitsAmount: 0,
        annualHours: 2080,
        trainingPerHour: 0,
        workersCompRate: 0,
        costCategory: className === 'PM/Super' ? 'GENERAL_CONDITIONS' : 'LABOR',
        notes:
          'Wage taken from the takeoff workbook. Add the fringe, the workers compensation rate and the state before pricing from it.',
        sortOrder: index,
      },
    })
  }

  // Takeoff rows carry a leading section banner (division blank on the banner row).
  const SECTION_NAMES = [
    'Excavation & Earthwork', 'Site Utilities', 'Concrete', 'Framing: Rough Carpentry',
    'Drywall', 'Tile & Stone', 'Roofing & Moisture Protection', 'Openings',
    'Finishes: Paint, Flooring & Trim', 'Mechanical / Electrical / Plumbing',
    'Exterior Improvements', 'Additional Items',
  ]
  const sections = await Promise.all(
    SECTION_NAMES.map((name, i) =>
      prisma.estimateSection.create({ data: { estimateId: estimate.id, name, sortOrder: i } }),
    ),
  )
  const sectionByName = new Map(sections.map((x) => [x.name, x]))

  let currentSection = sections[0]
  let itemOrder = 0
  for (const row of raw.takeoff) {
    const div = s(row['CSI Division'])
    const description = s(row['Item Description'])

    // A section banner carries the section name in the division column with no
    // item description. Everything after it belongs to that section.
    if (!description) {
      const banner = (div ?? '').toLowerCase()
      const match = SECTION_NAMES.find((name) => banner.startsWith(name.toLowerCase()))
      if (match) currentSection = sectionByName.get(match)!
      continue
    }

    const divisionCode = div ? div.slice(0, 2) : null
    await prisma.estimateItem.create({
      data: {
        estimateId: estimate.id,
        sectionId: currentSection.id,
        divisionId: divisionCode ? divisionByCode.get(divisionCode)?.id : undefined,
        description,
        drawingRef: s(row['Dwg / Detail Ref']),
        measure: (MEASURE_MAP[String(row['Measure'])] ?? 'EA') as never,
        count: n(row['Count']),
        length: n(row['Length (ft)']),
        width: n(row['Width (ft)']),
        depth: n(row['Depth (ft)']),
        uom: s(row['UOM']),
        wastePct: n(row['Waste %']),
        laborClass: s(row['Labor Class']),
        laborHrsPerUnit: n(row['Labor hrs / unit']),
        materialUnitCost: n(row['Material $ / unit']),
        equipmentUnitCost: n(row['Equip $ / unit']),
        subUnitCost: n(row['Sub $ / unit']),
        notes: s(row['Notes']),
        sortOrder: itemOrder++,
      },
    })
  }

  await prisma.generalConditionItem.createMany({
    data: raw.gcItems.map((row, i) => ({
      estimateId: estimate.id,
      item: String(row['Item']),
      basis: String(row['Basis'] ?? 'LS'),
      qty: n(row['Qty']),
      followsDuration: String(row['Basis']) === 'WK' && n(row['Qty']) === 22,
      unitCost: n(row['Unit Cost ($)']),
      notes: s(row['Notes']),
      sortOrder: i,
    })),
  })

  await prisma.estimateAlternate.createMany({
    data: raw.alternates
      .filter((r) => s(r['Alt #']))
      .map((row, i) => ({
        estimateId: estimate.id,
        number: String(row['Alt #']),
        description: String(row['Description']),
        amount: n(row['Add / (Deduct) ($)']),
        sortOrder: i,
      })),
  })

  await prisma.estimateClarification.createMany({
    data: [
      'Bid is based on the drawing set and addenda listed on the estimate setup.',
      'Permits and plan-review fees carried as an allowance; final by jurisdiction.',
      'Testing and special inspections carried as an allowance.',
      'Excludes hazardous material abatement, rock excavation, and dewatering.',
      'Excludes owner-furnished equipment and furnishings unless noted.',
      'Sales tax included on materials at the rate shown on the estimate setup.',
    ].map((text, i) => ({ estimateId: estimate.id, text, sortOrder: i })),
  })

  // Sub quote packages on the estimate
  for (const [i, row] of raw.subQuotes.entries()) {
    const pkg = await prisma.bidPackage.create({
      data: {
        estimateId: estimate.id,
        name: String(row['Trade / Scope']),
        divisionCode: s(row['CSI Division'])?.slice(0, 2) ?? null,
        tradeId: tradeByName.get(String(row['Trade / Scope']))?.id,
        carriedAmount: n(row['Carried in Takeoff ($)']),
        budgetAmount: n(row['Carried in Takeoff ($)']),
        status: 'LEVELED',
        notes: s(row['Scope Notes / Leveling Basis']),
        sortOrder: i,
      },
    })
    for (const [j, letter] of (['A', 'B', 'C'] as const).entries()) {
      const name = s(row[`Bidder ${letter}`])
      if (!name) continue
      await prisma.bidPackageQuote.create({
        data: {
          packageId: pkg.id,
          vendorId: vendorByName.get(name)?.id,
          vendorName: name,
          baseAmount: n(row[`${letter} Base ($)`]),
          adjustmentAmount: n(row[`${letter} Adj ($)`]),
          status: (String(row['Status']) === 'Received' ? 'RECEIVED' : 'PENDING') as never,
          notes: j === 0 ? s(row['Scope Notes / Leveling Basis']) : null,
          sortOrder: j,
        },
      })
    }
  }

  // ── Projects ────────────────────────────────────────────────────────────
  const detailedJob = '26-001'

  for (const row of raw.projectSummary) {
    const number = String(row['Job #'])
    const isDetailed = number === detailedJob
    const pm = userByName.get(String(row['Project Manager']))

    const project = await prisma.project.create({
      data: {
        companyId: company.id,
        number,
        name: String(row['Project Name']),
        clientId: clientByName.get(String(row['Client']))?.id,
        city: String(row['Location'] ?? '').split(',')[0]?.trim() || null,
        state: String(row['Location'] ?? '').split(',')[1]?.trim() || null,
        projectType: isDetailed ? 'Residential, New' : inferType(String(row['Project Name'])),
        deliveryMethod: isDetailed ? 'Design-Build' : 'General Contract',
        architect: isDetailed ? 'Vale + Stone Architects' : null,
        pmUserId: pm?.id,
        superintendent: s(row['Superintendent']),
        status: (PROJECT_STATUS_MAP[String(row['Status'])] ?? 'ACTIVE') as never,
        noticeToProceed: d(row['Start Date']),
        contractStart: d(row['Start Date']),
        contractCompletion: d(row['Contract Completion']),
        forecastCompletion: d(row['Forecast Completion']),
        dataDate: D('2026-03-31'),
        originalContractSum: isDetailed ? 2_450_000 : n(row['Current Contract ($)']),
        ownerRetentionPct: 0.05,
        defaultSubRetentionPct: 0.05,
        targetMarginPct: isDetailed ? 0.18 : 0.16,
        laborBurdenPct: 0.34,
        overheadPct: 0.06,
        workDaysPerWeek: 5,
        eacMethod: 'BOTTOM_UP',
        pocMethod: 'COST_TO_COST',
        safetyScore: n(row['Safety Score']) || null,
        qualityScore: n(row['Quality Score']) || null,
        clientSatScore: isDetailed ? 4.5 : null,
        recordablesYtd: 0,
        nearMissesYtd: isDetailed ? 2 : 0,
        observationsYtd: isDetailed ? 41 : 0,
        sourceBidId: number === '26-005' ? bidByNumber.get('B-26-019')?.id : undefined,
      },
    })

    if (isDetailed) {
      await seedDetailedProject(project.id, company.id, codeByCode, tradeByName, vendorByName)
    } else {
      await seedSummaryProject(project.id, row, codeByCode)
    }
  }

  // ── Company accounting inputs ───────────────────────────────────────────
  await prisma.companyMonthly.createMany({
    data: raw.companyMonthly
      .filter((r) => d(r['Month']))
      .map((row) => ({
        companyId: company.id,
        month: d(row['Month'])!,
        billings: n(row['Billings ($)']),
        costs: n(row['Costs ($)']),
        cashIn: n(row['Cash In ($)']),
        cashOut: n(row['Cash Out ($)']),
        overhead: n(row['Billings ($)']) * 0.06,
      })),
  })

  await prisma.arAgingBucket.createMany({
    data: [
      ['Current (0-30 days)', 1_240_000],
      ['31-60 days', 486_000],
      ['61-90 days', 198_000],
      ['Over 90 days', 62_000],
    ].map(([bucket, amount], i) => ({
      companyId: company.id,
      asOf: D('2026-03-31'),
      bucket: bucket as string,
      amount: amount as number,
      sortOrder: i,
    })),
  })

  console.log('Seed complete.')
  console.log('  Sign in with owner@constructx.com / constructx')
}

function inferType(name: string): string {
  if (/apartment|townhome|residence|estate|home|adu|duplex/i.test(name)) return 'Residential: New'
  if (/medical|dental|office|retail|church|distribution|shell/i.test(name)) return 'Commercial'
  return 'Commercial'
}

/**
 * Job 26-001 is seeded from the full Project Controls workbook: every budget
 * line, commitment, invoice, pay application, change order and quantity item.
 */
async function seedDetailedProject(
  projectId: string,
  companyId: string,
  codeByCode: Map<string, { id: string; code: string; description: string; category: CostCategory }>,
  tradeByName: Map<string, { id: string }>,
  vendorByName: Map<string, { id: string; name: string }>,
) {
  // Budget lines + the change-order budget as a revision, preserving history.
  const budgetLineByCode = new Map<string, { id: string }>()
  for (const [i, row] of raw.financials.entries()) {
    const code = String(row['Cost Code'])
    const costCode = codeByCode.get(code)!
    const line = await prisma.budgetLine.create({
      data: {
        projectId,
        costCodeId: costCode.id,
        description: String(row['Description']),
        category: (CATEGORY_MAP[String(row['Category'])] ?? 'OTHER') as CostCategory,
        tradeId: tradeByName.get(String(row['Trade / Scope']))?.id,
        originalBudget: n(row['Original Budget ($)']),
        notes: s(row['Notes']),
        sortOrder: i,
      },
    })
    budgetLineByCode.set(code, line)

    const coBudget = n(row['Approved CO Budget ($)'])
    if (coBudget !== 0) {
      await prisma.budgetRevision.create({
        data: {
          projectId,
          budgetLineId: line.id,
          type: 'CHANGE_ORDER',
          amount: coBudget,
          reason: 'Approved change-order cost impact posted to budget',
        },
      })
    }
  }

  // Cost transactions. Actual cost is spread across the three elapsed months in
  // the proportion the workbook's Progress & Forecast tab recorded, so the cost
  // ledger, the monthly chart and the S-curve all agree. Accruals post at the
  // data date, which is what an accrual is.
  const monthlyActuals = raw.progress
    .filter((r) => n(r['Actual Cost ($)']) > 0)
    .map((r) => ({ periodEnd: d(r['Month End'])!, cost: n(r['Actual Cost ($)']) }))
  const monthlyTotal = monthlyActuals.reduce((a, m) => a + m.cost, 0) || 1

  for (const row of raw.financials) {
    const code = String(row['Cost Code'])
    const costCodeId = codeByCode.get(code)!.id
    const actual = n(row['Cost to Date ($)'])
    const accrual = n(row['Accruals / Pending ($)'])

    if (actual !== 0) {
      let allocated = 0
      for (const [i, month] of monthlyActuals.entries()) {
        const amount =
          i === monthlyActuals.length - 1
            ? Math.round(actual - allocated)
            : Math.round(actual * (month.cost / monthlyTotal))
        allocated += amount
        if (amount === 0) continue
        await prisma.costTransaction.create({
          data: {
            projectId,
            costCodeId,
            date: month.periodEnd,
            type: 'ACTUAL',
            source: 'IMPORT',
            description: `${row['Description']}, cost posted for the month`,
            reference: `Accounting import ${month.periodEnd.toISOString().slice(0, 7)}`,
            amount,
          },
        })
      }
    }

    if (accrual !== 0) {
      await prisma.costTransaction.create({
        data: {
          projectId,
          costCodeId,
          date: D('2026-03-31'),
          type: 'ACCRUAL',
          source: 'MANUAL',
          description: `${row['Description']}, accrued work in place not yet invoiced`,
          amount: accrual,
        },
      })
    }
  }

  // Subcontracts
  const commitmentByVendor = new Map<string, { id: string }>()
  for (const row of raw.subcontractors) {
    const vendorName = String(row['Company Name'])
    const vendor = vendorByName.get(vendorName)!
    const tradeName = String(row['Trade / Scope'])
    // Map the trade back to its cost code via the budget lines.
    const budgetRow = raw.financials.find((f) => String(f['Trade / Scope']) === tradeName)
    const costCode = budgetRow ? codeByCode.get(String(budgetRow['Cost Code'])) : undefined
    if (!costCode) continue

    const commitment = await prisma.commitment.create({
      data: {
        projectId,
        vendorId: vendor.id,
        type: 'SUBCONTRACT',
        number: String(row['Subcontract #']),
        description: s(row['Scope of Work']),
        scopeOfWork: s(row['Scope of Work']),
        originalAmount: n(row['Original Contract ($)']),
        retentionPct: n(row['Retention %']) || 0.05,
        status: row['Contract Executed'] === 'Y' ? 'EXECUTED' : 'ISSUED',
        dateExecuted: row['Contract Executed'] === 'Y' ? D('2026-01-15') : null,
        pctComplete: n(row['% Complete']),
        lines: { create: [{ costCodeId: costCode.id, amount: n(row['Original Contract ($)']) }] },
      },
    })
    commitmentByVendor.set(vendorName, commitment)

    const approvedCo = n(row['Approved COs ($)'])
    if (approvedCo !== 0) {
      await prisma.commitmentChange.create({
        data: {
          commitmentId: commitment.id,
          number: 'SCO-001',
          description: 'Approved subcontract change order',
          amount: approvedCo,
          status: 'APPROVED',
          dateApproved: D('2026-02-20'),
        },
      })
    }
    const pendingCo = n(row['Pending COs ($)'])
    if (pendingCo !== 0) {
      await prisma.commitmentChange.create({
        data: {
          commitmentId: commitment.id,
          number: 'SCO-002',
          description: 'Pending subcontract change order',
          amount: pendingCo,
          status: 'PENDING',
          dateSubmitted: D('2026-03-12'),
        },
      })
    }
  }

  // Purchase orders
  for (const row of raw.purchaseOrders) {
    const vendorName = String(row['Vendor'])
    const vendor = vendorByName.get(vendorName)
    const costCode = codeByCode.get(String(row['Cost Code']))
    if (!vendor || !costCode) continue
    await prisma.commitment.create({
      data: {
        projectId,
        vendorId: vendor.id,
        type: 'PURCHASE_ORDER',
        number: String(row['PO #']),
        description: s(row['Description']),
        originalAmount: n(row['PO Amount ($)']),
        retentionPct: 0,
        status: (PO_STATUS_MAP[String(row['Status'])] ?? 'ISSUED') as never,
        dateIssued: d(row['Date Issued']),
        expectedDelivery: d(row['Expected Delivery']),
        actualDelivery: d(row['Actual Delivery']),
        receivedAmount: n(row['Received ($)']),
        pctComplete: n(row['PO Amount ($)']) ? n(row['Received ($)']) / n(row['PO Amount ($)']) : 0,
        lines: { create: [{ costCodeId: costCode.id, amount: n(row['PO Amount ($)']) }] },
      },
    })
  }

  // Link the posted cost back to the commitment that authorised it, so the job
  // cost ledger can be filtered by vendor and each commitment shows its spend.
  {
    const allCommitments = await prisma.commitment.findMany({
      where: { projectId },
      include: { lines: true },
    })
    const byCostCode = new Map<string, { id: string; vendorId: string }>()
    for (const c of allCommitments) {
      for (const line of c.lines) {
        if (!byCostCode.has(line.costCodeId)) byCostCode.set(line.costCodeId, { id: c.id, vendorId: c.vendorId })
      }
    }
    for (const [costCodeId, commitment] of byCostCode) {
      await prisma.costTransaction.updateMany({
        where: { projectId, costCodeId, type: 'ACTUAL' },
        data: { commitmentId: commitment.id, vendorId: commitment.vendorId },
      })
    }
  }

  // Subcontractor invoices
  for (const row of raw.subPayments) {
    const vendorName = String(row['Subcontractor'])
    const vendor = vendorByName.get(vendorName)
    const commitment = commitmentByVendor.get(vendorName)
    const costCode = codeByCode.get(String(row['Cost Code']))
    if (!vendor) continue
    await prisma.subInvoice.create({
      data: {
        projectId,
        commitmentId: commitment?.id,
        vendorId: vendor.id,
        costCodeId: costCode?.id,
        invoiceNumber: String(row['Invoice #']),
        periodEnd: d(row['Period End']),
        amount: n(row['Invoice Amount ($)']),
        retentionPct: n(row['Retention %']) || 0.05,
        dateReceived: d(row['Date Received']),
        approved: row['Approved?'] === 'Y',
        dateApproved: d(row['Date Approved']),
        amountPaid: n(row['Amount Paid ($)']),
        datePaid: d(row['Date Paid']),
        lienWaiverReceived: row["Lien Waiver Rec'd"] === 'Y',
        notes: s(row['Notes']),
      },
    })
  }

  /*
    Change orders.

    The workbook carried a lump-sum owner amount and a lump-sum cost amount per
    change order, so each is seeded as a lump sum rather than priced from lines:
    `priceFromLines` is false and the two entered figures are read exactly as
    the workbook stated them. Pricing one from its lines is something a person
    opts into afterwards, and doing it changes the number, which is why it is
    not done on their behalf here.

    The approval is what makes an amount count. Rows the workbook called
    approved or executed are seeded with an approval dated to the workbook's own
    approval date, so the seeded contract position reproduces the workbook.
    Everything else is entered and pending, contributing nothing.
  */
  for (const row of raw.changeOrders) {
    const workbookStatus = String(row['Status'])
    const wasApproved = CO_APPROVED_IN_WORKBOOK.has(workbookStatus)
    const approvedOn = wasApproved ? (d(row['Date Approved']) ?? D('2026-03-31')) : null

    const co = await prisma.changeOrder.create({
      data: {
        projectId,
        number: String(row['CO / PCO #']),
        documentKind: 'CHANGE_ORDER',
        type: (CO_TYPE_MAP[String(row['Type'])] ?? 'OWNER_REQUEST') as never,
        description: String(row['Description']),
        origin: s(row['Origin (RFI/ASI/Field)']),
        tradeId: tradeByName.get(String(row['Trade / Scope']))?.id,
        status: (CO_STATUS_MAP[workbookStatus] ?? 'READY_TO_SEND') as never,
        dateInitiated: d(row['Date Initiated']),
        dateSubmitted: d(row['Date Submitted']),
        dateApproved: d(row['Date Approved']),
        fullySignedAt: approvedOn,
        approvedAt: approvedOn,
        approvalCertification: wasApproved
          ? 'Carried across from the source workbook, which recorded this change order as approved and executed.'
          : null,
        priceFromLines: false,
        enteredOwnerAmount: n(row['Owner CO Amount ($)']),
        enteredCostAmount: n(row['Cost Amount ($)']),
        probabilityPct: wasApproved ? 1 : 0.5,
        scheduleImpactDays: n(row['Schedule Impact (days)']),
        notes: s(row['Notes']),
      },
    })

    // The cost breakdown, which is what the approved amount posts to the budget
    // against. One line per change order is all the workbook carried.
    const tradeName = String(row['Trade / Scope'])
    const budgetRow = raw.financials.find((f) => String(f['Trade / Scope']) === tradeName)
    const costCode = budgetRow ? codeByCode.get(String(budgetRow['Cost Code'])) : undefined
    if (costCode && n(row['Cost Amount ($)']) !== 0) {
      await prisma.changeOrderLine.create({
        data: {
          changeOrderId: co.id,
          costCodeId: costCode.id,
          category: costCode.category,
          description: String(row['Description']),
          measure: 'LS',
          count: 1,
          ...unitCostForCategory(costCode.category, n(row['Cost Amount ($)'])),
        },
      })
    }

    if (wasApproved) {
      await prisma.documentSignature.createMany({
        data: [
          { changeOrderId: co.id, party: 'Owner', role: 'Owner', status: 'SIGNED', signedAt: approvedOn, sortOrder: 0 },
          { changeOrderId: co.id, party: 'ConstructX', role: 'Contractor', status: 'SIGNED', signedAt: approvedOn, sortOrder: 1 },
        ],
      })
    }
  }

  // Schedule of values, built from the budget with the contract markup applied.
  const budgetTotal = raw.financials.reduce(
    (a, r) => a + n(r['Original Budget ($)']) + n(r['Approved CO Budget ($)']),
    0,
  )
  const contractSum = 2_518_000
  const sovByCode = new Map<string, { id: string }>()
  for (const [i, row] of raw.financials.entries()) {
    const code = String(row['Cost Code'])
    const budget = n(row['Original Budget ($)']) + n(row['Approved CO Budget ($)'])
    const sov = await prisma.sovLine.create({
      data: {
        projectId,
        number: String(i + 1).padStart(3, '0'),
        description: String(row['Description']),
        costCodeId: codeByCode.get(code)!.id,
        scheduledValue: Math.round((budget / budgetTotal) * contractSum),
        sortOrder: i,
      },
    })
    sovByCode.set(code, sov)
  }

  // Owner pay applications, distributed across the SOV in budget proportion.
  for (const row of raw.ownerBillings) {
    const appNumber = n(row['App #'])
    const cumulative = n(row['Total Completed & Stored ($)'])
    const prior = raw.ownerBillings
      .filter((r) => n(r['App #']) < appNumber)
      .reduce((a, r) => Math.max(a, n(r['Total Completed & Stored ($)'])), 0)
    const thisPeriod = cumulative - prior

    const billing = await prisma.ownerBilling.create({
      data: {
        projectId,
        appNumber,
        periodTo: d(row['Period To'])!,
        dateSubmitted: d(row['Date Submitted']),
        dateApproved: d(row['Date Approved']),
        datePaid: d(row['Date Paid']),
        retainagePct: n(row['Retainage %']) || 0.05,
        amountPaid: n(row['Amount Paid ($)']),
        status: d(row['Date Paid']) ? 'PAID' : d(row['Date Approved']) ? 'APPROVED' : 'SUBMITTED',
        notes: s(row['Notes']),
      },
    })

    // Allocate the period's billing across the SOV in budget proportion, giving
    // the rounding remainder to the last line so the application ties exactly.
    let allocated = 0
    const entries = [...sovByCode.entries()]
    for (const [i, [code, sov]] of entries.entries()) {
      const f = raw.financials.find((x) => String(x['Cost Code']) === code)!
      const budget = n(f['Original Budget ($)']) + n(f['Approved CO Budget ($)'])
      const amount =
        i === entries.length - 1
          ? thisPeriod - allocated
          : Math.round(thisPeriod * (budget / budgetTotal))
      allocated += amount
      await prisma.ownerBillingLine.create({
        data: { billingId: billing.id, sovLineId: sov.id, workThisPeriod: amount, storedMaterials: 0 },
      })
    }
  }

  // Cash-flow curve from Progress & Forecast
  for (const row of raw.progress) {
    const periodEnd = d(row['Month End'])
    if (!periodEnd) continue
    await prisma.cashFlowPeriod.create({
      data: {
        projectId,
        periodEnd,
        plannedDeltaPct: n(row['Planned Δ%']),
        actualPctComplete: n(row['Actual % Complete']) || null,
        actualCost: n(row['Actual Cost ($)']) || null,
        notes: s(row['Notes']),
      },
    })
  }

  // Quantity tracking
  for (const [i, row] of raw.quantity.entries()) {
    const item = await prisma.quantityItem.create({
      data: {
        projectId,
        costCodeId: codeByCode.get(String(row['Cost Code']))?.id,
        description: String(row['Work Item / Activity']),
        uom: String(row['UOM'] ?? 'EA'),
        budgetQty: n(row['Budget Qty']),
        budgetUnitRate: n(row['Budget Unit Rate (hrs/unit)']),
        targetFinish: d(row['Target Finish Date']),
        materialOrderedQty: n(row['Material Ordered Qty']),
        notes: s(row['Notes']),
        sortOrder: i,
      },
    })
    const priorHours = n(row['Actual Hours']) * 0.7
    const priorDays = n(row['Crew Days Worked']) * 0.7
    await prisma.quantityEntry.createMany({
      data: [
        {
          itemId: item.id,
          periodEnd: D('2026-02-28'),
          installedQty: n(row['Installed Prior']),
          actualHours: Math.round(priorHours * 10) / 10,
          crewDays: Math.round(priorDays),
        },
        {
          itemId: item.id,
          periodEnd: D('2026-03-31'),
          installedQty: n(row['Installed This Period']),
          actualHours: Math.round((n(row['Actual Hours']) - priorHours) * 10) / 10,
          crewDays: n(row['Crew Days Worked']) - Math.round(priorDays),
        },
      ],
    })
  }

  // Buyout packages
  for (const [i, row] of raw.bidLeveling.entries()) {
    const tradeName = String(row['Trade / Scope'])
    const awardedName = s(row['Awarded To'])
    const pkg = await prisma.bidPackage.create({
      data: {
        projectId,
        tradeId: tradeByName.get(tradeName)?.id,
        name: tradeName,
        budgetAmount: n(row['Budget ($)']),
        carriedAmount: n(row['Budget ($)']),
        awardedVendorId: awardedName ? vendorByName.get(awardedName)?.id : undefined,
        awardAmount: n(row['Award Amount ($)']),
        status: (String(row['Status']) === 'Bought Out'
          ? 'BOUGHT_OUT'
          : String(row['Status']) === 'Awarded'
            ? 'AWARDED'
            : String(row['Status']) === 'Leveled'
              ? 'LEVELED'
              : 'BIDDING') as never,
        notes: s(row['Notes']),
        sortOrder: i,
      },
    })
    for (const [j, letter] of (['A', 'B', 'C'] as const).entries()) {
      const name = s(row[`Bidder ${letter}`])
      if (!name) continue
      await prisma.bidPackageQuote.create({
        data: {
          packageId: pkg.id,
          vendorId: vendorByName.get(name)?.id,
          vendorName: name,
          baseAmount: n(row[`${letter} Base ($)`]),
          adjustmentAmount: n(row[`${letter} Adj ($)`]),
          status: n(row[`${letter} Base ($)`]) > 0 ? 'RECEIVED' : 'PENDING',
          sortOrder: j,
        },
      })
    }
  }

  // Locked February forecast so month-over-month comparison works on day one.
  const budgetLines = await prisma.budgetLine.findMany({ where: { projectId } })
  const febPeriod = await prisma.forecastPeriod.create({
    data: { projectId, periodEnd: D('2026-02-28'), status: 'LOCKED', lockedAt: D('2026-03-05') },
  })
  const marPeriod = await prisma.forecastPeriod.create({
    data: { projectId, periodEnd: D('2026-03-31'), status: 'OPEN' },
  })

  for (const line of budgetLines) {
    const row = raw.financials.find((f) => codeByCode.get(String(f['Cost Code']))?.id === line.costCodeId)
    if (!row) continue
    const currentBudget = n(row['Original Budget ($)']) + n(row['Approved CO Budget ($)'])
    const pct = n(row['% Complete'])
    const costToDate = n(row['Cost to Date ($)']) + n(row['Accruals / Pending ($)'])
    const eac = costToDate + (pct >= 1 ? 0 : currentBudget * (1 - pct))

    // February forecast: the same lines a month earlier, at ~80% of the progress.
    const febPct = Math.max(0, pct * 0.8)
    const febCost = costToDate * 0.72
    const febEac = febCost + (febPct >= 1 ? 0 : currentBudget * (1 - febPct))

    await prisma.forecastLine.create({
      data: {
        periodId: febPeriod.id,
        costCodeId: line.costCodeId,
        currentBudget,
        costToDate: febCost,
        committed: 0,
        accrued: 0,
        pctComplete: febPct,
        estimateToComplete: febEac - febCost,
        estimateAtCompletion: febEac,
        previousEac: currentBudget,
        riskLevel: 'LOW',
        confidence: 0.8,
      },
    })

    await prisma.forecastLine.create({
      data: {
        periodId: marPeriod.id,
        costCodeId: line.costCodeId,
        currentBudget,
        costToDate,
        committed: 0,
        accrued: n(row['Accruals / Pending ($)']),
        pctComplete: pct,
        estimateToComplete: eac - costToDate,
        estimateAtCompletion: eac,
        previousEac: febEac,
        riskLevel: eac > currentBudget + 0.005 ? 'HIGH' : 'LOW',
        confidence: 0.85,
        note:
          eac > currentBudget + 0.005
            ? 'Forecast above budget: production rate below plan; recovery plan in progress.'
            : null,
      },
    })
  }

  await prisma.projectSnapshot.create({
    data: {
      projectId,
      asOf: D('2026-02-28'),
      label: 'February 2026 month-end close',
      payload: JSON.stringify({ source: 'Seeded from the Project Controls workbook February position' }),
    },
  })
}

/**
 * The other jobs are seeded at the summary level the Master workbook carried:
 * one budget line, its cost to date, and enough billing history to reproduce the
 * portfolio numbers. Full detail lives in job 26-001.
 */
async function seedSummaryProject(
  projectId: string,
  row: Row,
  codeByCode: Map<string, { id: string; code: string; description: string; category: CostCategory }>,
) {
  const contract = n(row['Current Contract ($)'])
  const costToDate = n(row['Cost to Date ($)'])
  const forecastCost = n(row['Forecast at Completion ($)'])
  const billed = n(row['Billed to Date ($)'])
  const ar = n(row['AR Outstanding ($)'])
  const pct = n(row['Overall % Complete'])

  const start = d(row['Start Date'])!
  const finish = d(row['Forecast Completion']) ?? d(row['Contract Completion'])!
  const dataDate = D('2026-03-31')

  /** Month ends from the contract start to the data date: the elapsed history. */
  const elapsedMonths: Date[] = []
  {
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    while (cursor <= dataDate) {
      elapsedMonths.push(cursor)
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 2, 0))
    }
  }
  // Progress weights follow the same bell shape a construction job spends on.
  const totalMonths = Math.max(
    1,
    (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 + finish.getUTCMonth() - start.getUTCMonth() + 1,
  )
  const weightAt = (index: number) => {
    const x = (index + 0.5) / totalMonths
    return Math.exp(-((x - 0.5) ** 2) / 0.08)
  }
  const elapsedWeights = elapsedMonths.map((_, i) => weightAt(i))
  const elapsedWeightTotal = elapsedWeights.reduce((a, b) => a + b, 0) || 1

  // Distribute the forecast across the category mix a job of this type carries.
  const mix: [string, number][] = [
    ['01-000', 0.1],
    ['02-500', 0.14],
    ['03-100', 0.16],
    ['06-100', 0.12],
    ['06-105', 0.08],
    ['07-400', 0.06],
    ['15-000', 0.11],
    ['16-000', 0.13],
    ['12-000', 0.06],
    ['99-000', 0.04],
  ]

  let order = 0
  for (const [code, share] of mix) {
    const costCode = codeByCode.get(code)
    if (!costCode) continue
    const lineBudget = Math.round(forecastCost * share)
    const line = await prisma.budgetLine.create({
      data: {
        projectId,
        costCodeId: costCode.id,
        description: costCode.code,
        category: costCode.category,
        originalBudget: lineBudget,
        sortOrder: order++,
      },
    })
    void line

    // Cost posts monthly across the elapsed history rather than as one lump, so
    // the S-curve, cash flow and company charts show a real spend profile.
    const lineCost = costToDate * share
    let allocatedCost = 0
    for (const [i, periodEnd] of elapsedMonths.entries()) {
      const amount =
        i === elapsedMonths.length - 1
          ? Math.round(lineCost - allocatedCost)
          : Math.round(lineCost * (elapsedWeights[i] / elapsedWeightTotal))
      allocatedCost += amount
      if (amount <= 0) continue
      await prisma.costTransaction.create({
        data: {
          projectId,
          costCodeId: costCode.id,
          date: periodEnd,
          type: 'ACTUAL',
          source: 'IMPORT',
          description: `${costCode.description}, cost posted for the month`,
          reference: `Accounting import ${periodEnd.toISOString().slice(0, 7)}`,
          amount,
        },
      })
    }
  }

  // One SOV line, billed monthly. The final application carries any outstanding
  // receivable so the AR position matches the Master workbook exactly.
  const sov = await prisma.sovLine.create({
    data: { projectId, number: '001', description: 'Contract work', scheduledValue: contract, sortOrder: 0 },
  })

  const collectedTotal = Math.max(0, billed * 0.95 - ar)
  let allocatedBilling = 0
  let allocatedCollection = 0

  for (const [i, periodEnd] of elapsedMonths.entries()) {
    const isLast = i === elapsedMonths.length - 1
    const amount = isLast
      ? Math.round(billed - allocatedBilling)
      : Math.round(billed * (elapsedWeights[i] / elapsedWeightTotal))
    allocatedBilling += amount
    if (amount <= 0 && !isLast) continue

    // Everything but the final application is collected; the last one is the
    // open receivable when the workbook shows AR outstanding.
    const paid = isLast && ar > 0 ? 0 : Math.round(Math.min(amount * 0.95, collectedTotal - allocatedCollection))
    allocatedCollection += Math.max(0, paid)

    await prisma.ownerBilling.create({
      data: {
        projectId,
        appNumber: i + 1,
        periodTo: periodEnd,
        dateSubmitted: new Date(periodEnd.getTime() + 2 * 86_400_000),
        dateApproved: paid > 0 ? new Date(periodEnd.getTime() + 8 * 86_400_000) : null,
        datePaid: paid > 0 ? new Date(periodEnd.getTime() + 25 * 86_400_000) : null,
        retainagePct: 0.05,
        amountPaid: Math.max(0, paid),
        status: paid > 0 ? 'PAID' : 'SUBMITTED',
        lines: { create: [{ sovLineId: sov.id, workThisPeriod: amount, storedMaterials: 0 }] },
      },
    })
  }

  // Planned progress curve so the project has a real S-curve of its own.
  {
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    const weights: number[] = []
    const months: Date[] = []
    for (let i = 0; i < totalMonths; i++) {
      months.push(cursor)
      weights.push(weightAt(i))
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 2, 0))
    }
    const weightTotal = weights.reduce((a, b) => a + b, 0) || 1
    // Scale the elapsed curve so actual progress lands exactly on the workbook's
    // percent complete at the data date.
    const plannedAtDataDate = elapsedWeightTotal / weightTotal || 1
    let cumulative = 0
    for (const [i, periodEnd] of months.entries()) {
      const delta = weights[i] / weightTotal
      cumulative += delta
      const isPast = periodEnd <= dataDate
      await prisma.cashFlowPeriod.create({
        data: {
          projectId,
          periodEnd,
          plannedDeltaPct: delta,
          actualPctComplete: isPast ? Math.min(1, (cumulative / plannedAtDataDate) * pct) : null,
          actualCost: isPast ? Math.round(costToDate * (weights[i] / elapsedWeightTotal)) : null,
        },
      })
    }
  }

  // A single open forecast period carrying the workbook's percent complete.
  const period = await prisma.forecastPeriod.create({
    data: { projectId, periodEnd: D('2026-03-31'), status: 'OPEN' },
  })
  const lines = await prisma.budgetLine.findMany({ where: { projectId } })
  for (const line of lines) {
    const eac = line.originalBudget
    await prisma.forecastLine.create({
      data: {
        periodId: period.id,
        costCodeId: line.costCodeId,
        currentBudget: line.originalBudget,
        costToDate: line.originalBudget * pct,
        pctComplete: pct,
        estimateToComplete: eac * (1 - pct),
        estimateAtCompletion: eac,
        previousEac: eac,
        confidence: 0.8,
      },
    })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

export type { Prisma }
