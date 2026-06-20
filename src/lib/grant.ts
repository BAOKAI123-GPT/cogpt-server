import { prisma } from './db'
import { getTiers, getWsTiers } from './config'

const MONTH_MS = 30 * 24 * 3600 * 1000

// 幂等地把订单翻转为已支付并发放会员额度。返回本次是否实际发放（重复回调/查单只发一次）。
// 同时被 pay/notify(被动回调) 与 pay/status(主动查单兜底) 调用。
export async function settlePaidOrder(outTradeNo: string, tradeNo?: string | null): Promise<boolean> {
  const order = await prisma.order.findUnique({ where: { outTradeNo } })
  if (!order) return false
  const flipped = await prisma.order.updateMany({
    where: { outTradeNo, status: { not: 'paid' } },
    data: { status: 'paid', paidAt: new Date(), zpayTradeNo: tradeNo ?? null }
  })
  if (flipped.count === 0) return false // 已发放过，幂等返回

  if (order.product === 'wenshu') {
    // 翰文：发放月度订阅 + 开启本周 token 额度（每周刷新、不结转）
    const t = (await getWsTiers()).find((x) => x.id === order.tier)
    if (t) {
      const u = await prisma.user.findUnique({ where: { id: order.userId } })
      const baseTime =
        u?.wsExpiresAt && u.wsExpiresAt.getTime() > Date.now() ? u.wsExpiresAt.getTime() : Date.now()
      await prisma.user.update({
        where: { id: order.userId },
        data: {
          wsTier: t.id,
          wsExpiresAt: new Date(baseTime + MONTH_MS),
          wsWeekStart: new Date(),
          wsWeekTokens: t.weekTokens
        }
      })
    }
    return true
  }

  // CoGPT（生图）：原逻辑
  const t = (await getTiers()).find((x) => x.id === order.tier)
  if (t) {
    const u = await prisma.user.findUnique({ where: { id: order.userId } })
    const baseTime =
      u?.memberExpiresAt && u.memberExpiresAt.getTime() > Date.now() ? u.memberExpiresAt.getTime() : Date.now()
    await prisma.user.update({
      where: { id: order.userId },
      data: {
        memberTier: t.id,
        memberExpiresAt: new Date(baseTime + MONTH_MS),
        memberCredits: { increment: t.quota }
      }
    })
  }
  return true
}
