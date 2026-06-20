import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { queryZpayOrder, moneyMatchesCents } from '@/lib/zpay'
import { settlePaidOrder } from '@/lib/grant'

// 查询某笔订单是否已支付（客户端展示二维码后轮询，付款成功即自动到账+刷新额度）。
// 资金兜底：若本地仍未支付，主动向 zpay 查单核对，防止回调因隧道/网络异常掉单。
export async function GET(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const outTradeNo = new URL(req.url).searchParams.get('outTradeNo') || ''
  if (!outTradeNo) return NextResponse.json({ error: '缺少订单号' }, { status: 400 })
  let order = await prisma.order.findUnique({ where: { outTradeNo } })
  if (!order || order.userId !== u.id) return NextResponse.json({ error: '订单不存在' }, { status: 404 })

  if (order.status !== 'paid') {
    const q = await queryZpayOrder(outTradeNo)
    // 金额比较用数值（分），避免 "9.9" vs "9.90" 这类等值字符串不相等导致兜底查单不入账。
    if (q && q.paid && moneyMatchesCents(q.money, order.amountCents)) {
      await settlePaidOrder(outTradeNo, q.tradeNo)
      order = await prisma.order.findUnique({ where: { outTradeNo } })
    }
  }
  return NextResponse.json({ status: order!.status, paid: order!.status === 'paid' })
}
