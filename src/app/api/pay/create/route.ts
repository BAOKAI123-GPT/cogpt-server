import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { currentUser } from '@/lib/auth'
import { getTiers } from '@/lib/config'
import { prisma } from '@/lib/db'
import { createZpayOrder } from '@/lib/zpay'

function genNo(): string {
  return 'CG' + Date.now() + Math.random().toString(36).slice(2, 8)
}

export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { tier } = await req.json().catch(() => ({}))
  const t = (await getTiers()).find((x) => x.id === tier)
  if (!t) return NextResponse.json({ error: '套餐不存在' }, { status: 400 })

  // PUBLIC_BASE_URL 缺失防御：notify_url/return_url 必须是绝对地址，否则 zpay 回调会拼成相对路径
  // 静默失效（付了款不到账）。这里在建单前就拒绝，避免留下永远收不到回调的 pending 单。
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) {
    console.error('[pay/create] PUBLIC_BASE_URL 未配置或非法，拒绝建单', { base: process.env.PUBLIC_BASE_URL })
    return NextResponse.json({ error: '支付暂不可用：服务未正确配置回调地址，请联系客服' }, { status: 503 })
  }

  const outTradeNo = genNo()
  await prisma.order.create({
    data: { outTradeNo, userId: u.id, tier: t.id, amountCents: t.priceCents, status: 'pending' }
  })
  try {
    const r = await createZpayOrder({
      outTradeNo,
      moneyYuan: (t.priceCents / 100).toFixed(2),
      name: `Co-GPT ${t.name}`,
      notifyUrl: `${base}/api/pay/notify`,
      returnUrl: `${base}/pay/return`
    })
    // 把支付串(qr.alipay.com/...)转成二维码图片(data URL)直接返回，客户端内显示扫码即可。
    const qrSource = r.qrcode || r.payUrl
    let qrImg = ''
    try {
      if (qrSource) qrImg = await QRCode.toDataURL(qrSource, { width: 300, margin: 1 })
    } catch {
      /* 生成失败则前端回退到打开 payUrl */
    }
    return NextResponse.json({
      ok: true,
      payUrl: r.payUrl,
      qrcode: r.qrcode,
      img: r.img,
      qrImg,
      outTradeNo,
      amount: (t.priceCents / 100).toFixed(2)
    })
  } catch (e: any) {
    await prisma.order.update({ where: { outTradeNo }, data: { status: 'failed' } })
    // zpay 的具体原因(如"ZPAY账户余额不足")进 pm2 日志，便于后台判断是余额不足还是真 bug。
    const msg = String(e?.message ?? e)
    console.error('[pay/create] zpay 下单失败', { outTradeNo, tier: t.id, amountCents: t.priceCents, reason: msg })
    return NextResponse.json({ error: '下单失败：' + msg }, { status: 502 })
  }
}
