/**
 * A quick count of what the payroll reference seed produced. Run after a seed
 * to confirm every state is present and the two county lists are complete.
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../../src/generated/prisma/client'

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }),
  })
  console.log({
    jurisdictions: await prisma.payrollJurisdiction.count(),
    counties: await prisma.payrollCounty.count(),
    wa: await prisma.payrollCounty.count({ where: { jurisdiction: { code: 'WA' } } }),
    co: await prisma.payrollCounty.count({ where: { jurisdiction: { code: 'CO' } } }),
    withRate: await prisma.payrollJurisdiction.count({ where: { NOT: { sutaPct: null } } }),
    perHourWorkersComp: (
      await prisma.payrollJurisdiction.findMany({ where: { workersCompBasis: 'PER_HOUR' }, select: { code: true } })
    ).map((x) => x.code),
    stateFund: (
      await prisma.payrollJurisdiction.findMany({ where: { stateFund: true }, select: { code: true } })
    ).map((x) => x.code),
  })
}

main()
