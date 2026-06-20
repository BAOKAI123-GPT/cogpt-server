import { prisma } from '../src/lib/db'
import { setConfig } from '../src/lib/config'
import { issueToken } from '../src/lib/auth'

// 真实 key 不入库；运行前用环境变量传入：RELAY_API_KEY=sk-xxx tsx scripts/ws-test-setup.ts
// （key 见项目总结文档 墨童-项目总结.md 第 13 节）
const KEY = process.env.RELAY_API_KEY || ''

async function main(): Promise<void> {
  await setConfig('ws_relay_api_key', KEY)
  await setConfig('ws_relay_base_url', 'https://api.qingyuntop.top')
  const phone = '13900000001'
  let u = await prisma.user.findUnique({ where: { phone } })
  if (!u) u = await prisma.user.create({ data: { phone } })
  u = await prisma.user.update({
    where: { id: u.id },
    data: {
      wsTier: 'basic',
      wsExpiresAt: new Date(Date.now() + 30 * 864e5),
      wsWeekStart: new Date(),
      wsWeekTokens: 2_000_000
    }
  })
  console.log('TOKEN=' + issueToken(u.id))
  console.log('UID=' + u.id)
}
main().then(() => process.exit(0))
