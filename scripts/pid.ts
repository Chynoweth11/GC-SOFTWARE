import { prisma } from '../src/lib/db'
async function main() {
  const p = await prisma.project.findFirstOrThrow({ where: { number: '26-001' } })
  const e = await prisma.estimate.findFirstOrThrow()
  console.log(JSON.stringify({ project: p.id, estimate: e.id }))
  await prisma.$disconnect()
}
main()
