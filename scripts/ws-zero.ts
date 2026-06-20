import { prisma } from '../src/lib/db'
// 用法: node --import tsx scripts/ws-zero.ts [weekTokens] [weekStartDaysAgo]
async function main(): Promise<void> {
  const tokens = Number(process.argv[2] ?? 0)
  const daysAgo = Number(process.argv[3] ?? 0)
  const start = daysAgo > 0 ? new Date(Date.now() - daysAgo * 864e5) : new Date()
  const u = await prisma.user.update({
    where: { phone: '13900000001' },
    data: { wsWeekTokens: tokens, wsWeekStart: start }
  })
  console.log(`set wsWeekTokens=${u.wsWeekTokens} wsWeekStart=${u.wsWeekStart?.toISOString()}`)
}
main().then(() => process.exit(0))
