import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { summarizeWageSheet, type PayrollBurdenRates, type WageSheetSummary } from '@/lib/finance'

/**
 * Reads the prevailing wage sheets on a project and works them out.
 *
 * Nothing derived is stored. The database holds the seven boxes of the form and
 * the rates behind them; every subtotal, burden, total and average on the page
 * is computed here, so a sheet on screen can never disagree with a sheet in an
 * export or with the certified payroll figure a report carries.
 *
 * The rates come from three levels and each lives in exactly one place. The
 * federal rates are on the company, because they do not vary by state. The
 * state unemployment rate is on the jurisdiction, because it varies by state
 * and by employer. A sheet may override the state rate where the company's rate
 * changed part way through a job, and only then does the sheet store a rate at
 * all: `sutaPctOverride` is null in the ordinary case and the jurisdiction's
 * rate is used.
 */

export interface WageSheetView {
  id: string
  name: string
  rateScheduleDate: Date | null
  determinationRef: string | null
  notes: string | null
  jurisdiction: {
    id: string
    code: string
    name: string
    wageAuthority: string | null
    notes: string | null
    stateFund: boolean
    workersCompBasis: 'PER_HOUR' | 'PER_100_PAYROLL'
    sutaPct: number | null
    sutaRateYear: number | null
    verifiedAt: Date | null
    verifiedByName: string | null
    verifiedNote: string | null
  }
  county: { id: string; name: string; notes: string | null } | null
  /** The rates actually applied to this sheet, and where each came from. */
  rates: PayrollBurdenRates & {
    sutaSource: 'jurisdiction' | 'sheet override' | 'not set'
  }
  verifiedAt: Date | null
  verifiedByName: string | null
  verifiedNote: string | null
  /** True when both the sheet and the state rate behind it have been checked. */
  fullyVerified: boolean
  lines: {
    id: string
    trade: string
    classification: string | null
    hourlyWage: number
    hourlyBenefits: number
    trainingPerHour: number
    workersCompPerHour: number
    overtimeMultiplier: number
    publishedBaseWage: number | null
    publishedFringe: number | null
    notes: string | null
    sortOrder: number
  }[]
  summary: WageSheetSummary
}

function loadSheets(projectId: string) {
  return prisma.wageRateSheet.findMany({
    where: { projectId },
    include: {
      jurisdiction: { include: { verifiedBy: { select: { name: true } } } },
      county: true,
      verifiedBy: { select: { name: true } },
      lines: { orderBy: [{ sortOrder: 'asc' }, { trade: 'asc' }] },
    },
    orderBy: [{ rateScheduleDate: 'desc' }, { name: 'asc' }],
  })
}

export const getProjectWageSheets = cache(
  async (projectId: string, companyId: string): Promise<WageSheetView[]> => {
    const [project, company, sheets] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } }),
      prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { futaPct: true, ficaPct: true },
      }),
      loadSheets(projectId),
    ])
    if (!project) return []

    return sheets.map((sheet) => {
      // A sheet override wins where it is set, because a company's own rate can
      // change mid job. Otherwise the jurisdiction's rate, and where neither is
      // set the burden is zero and the sheet says out loud that it is unverified
      // rather than quietly pricing labour light.
      const override = sheet.sutaPctOverride
      const sutaPct = override ?? sheet.jurisdiction.sutaPct ?? 0
      const sutaSource: 'jurisdiction' | 'sheet override' | 'not set' =
        override !== null ? 'sheet override' : sheet.jurisdiction.sutaPct !== null ? 'jurisdiction' : 'not set'

      const rates: PayrollBurdenRates = {
        futaPct: company.futaPct,
        ficaPct: company.ficaPct,
        sutaPct,
      }

      const jurisdictionVerified = sheet.jurisdiction.verifiedAt !== null && sutaSource !== 'not set'

      return {
        id: sheet.id,
        name: sheet.name,
        rateScheduleDate: sheet.rateScheduleDate,
        determinationRef: sheet.determinationRef,
        notes: sheet.notes,
        jurisdiction: {
          id: sheet.jurisdiction.id,
          code: sheet.jurisdiction.code,
          name: sheet.jurisdiction.name,
          wageAuthority: sheet.jurisdiction.wageAuthority,
          notes: sheet.jurisdiction.notes,
          stateFund: sheet.jurisdiction.stateFund,
          workersCompBasis: sheet.jurisdiction.workersCompBasis,
          sutaPct: sheet.jurisdiction.sutaPct,
          sutaRateYear: sheet.jurisdiction.sutaRateYear,
          verifiedAt: sheet.jurisdiction.verifiedAt,
          verifiedByName: sheet.jurisdiction.verifiedBy?.name ?? null,
          verifiedNote: sheet.jurisdiction.verifiedNote,
        },
        county: sheet.county ? { id: sheet.county.id, name: sheet.county.name, notes: sheet.county.notes } : null,
        rates: { ...rates, sutaSource },
        verifiedAt: sheet.verifiedAt,
        verifiedByName: sheet.verifiedBy?.name ?? null,
        verifiedNote: sheet.verifiedNote,
        fullyVerified: sheet.verifiedAt !== null && jurisdictionVerified,
        lines: sheet.lines.map((line) => ({
          id: line.id,
          trade: line.trade,
          classification: line.classification,
          hourlyWage: line.hourlyWage,
          hourlyBenefits: line.hourlyBenefits,
          trainingPerHour: line.trainingPerHour,
          workersCompPerHour: line.workersCompPerHour,
          overtimeMultiplier: line.overtimeMultiplier,
          publishedBaseWage: line.publishedBaseWage,
          publishedFringe: line.publishedFringe,
          notes: line.notes,
          sortOrder: line.sortOrder,
        })),
        summary: summarizeWageSheet(
          sheet.lines.map((line) => ({
            trade: line.trade,
            hourlyWage: line.hourlyWage,
            hourlyBenefits: line.hourlyBenefits,
            trainingPerHour: line.trainingPerHour,
            workersCompPerHour: line.workersCompPerHour,
            overtimeMultiplier: line.overtimeMultiplier,
          })),
          rates,
          { jurisdictionVerified, rateScheduleDate: sheet.rateScheduleDate },
        ),
      }
    })
  },
)

export interface JurisdictionView {
  id: string
  code: string
  name: string
  sutaPct: number | null
  sutaWageBase: number | null
  sutaRateYear: number | null
  workersCompBasis: 'PER_HOUR' | 'PER_100_PAYROLL'
  stateFund: boolean
  wageAuthority: string | null
  notes: string | null
  verifiedAt: Date | null
  verifiedByName: string | null
  verifiedNote: string | null
  active: boolean
  countyCount: number
  /** Sheets built on this state, so a rate change shows what it affects. */
  sheetCount: number
  counties: { id: string; name: string; notes: string | null; verifiedAt: Date | null; active: boolean }[]
}

export const getJurisdictions = cache(async (companyId: string): Promise<JurisdictionView[]> => {
  const rows = await prisma.payrollJurisdiction.findMany({
    where: { companyId },
    include: {
      verifiedBy: { select: { name: true } },
      counties: { orderBy: { name: 'asc' } },
      _count: { select: { counties: true, sheets: true } },
    },
    orderBy: { name: 'asc' },
  })

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    sutaPct: row.sutaPct,
    sutaWageBase: row.sutaWageBase,
    sutaRateYear: row.sutaRateYear,
    workersCompBasis: row.workersCompBasis,
    stateFund: row.stateFund,
    wageAuthority: row.wageAuthority,
    notes: row.notes,
    verifiedAt: row.verifiedAt,
    verifiedByName: row.verifiedBy?.name ?? null,
    verifiedNote: row.verifiedNote,
    active: row.active,
    countyCount: row._count.counties,
    sheetCount: row._count.sheets,
    counties: row.counties.map((county) => ({
      id: county.id,
      name: county.name,
      notes: county.notes,
      verifiedAt: county.verifiedAt,
      active: county.active,
    })),
  }))
})

/** The short list a sheet's state and county pickers need. */
export const getJurisdictionOptions = cache(async (companyId: string) => {
  const rows = await prisma.payrollJurisdiction.findMany({
    where: { companyId, active: true },
    select: {
      id: true,
      code: true,
      name: true,
      sutaPct: true,
      verifiedAt: true,
      counties: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })
  return rows
})
