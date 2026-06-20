import { prisma } from '@/lib/db'
import { verifyZpayNotify, moneyMatchesCents } from '@/lib/zpay'
import { settlePaidOrder } from '@/lib/grant'

function ok(): Response {
  return new Response('success')
}
function fail(m: string): Response {
  return new Response('fail:' + m, { status: 400 })
}

// zpay 回调是 GET：① 验签 ② 校金额 ③ 幂等 → 发放会员额度
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const data: Record<string, string> = {}
  url.searchParams.forEach((v, k) => (data[k] = v))

  if (!verifyZpayNotify(data)) return fail('bad-sign')
  if (data.trade_status !== 'TRADE_SUCCESS') return ok()

  const order = await prisma.order.findUnique({ where: { outTradeNo: data.out_trade_no } })
  if (!order) return fail('no-order')
  // 金额比较用数值（分），避免 "9.9" vs "9.90" 这类等值字符串不相等导致漏单。
  if (!moneyMatchesCents(data.money, order.amountCents)) return fail('amount-mismatch')

  await settlePaidOrder(order.outTradeNo, data.trade_no ?? null)
  return ok()
}
