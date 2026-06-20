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

  const outTradeNo = genNo()
  await prisma.order.create({
    data: { outTradeNo, userId: u.id, tier: t.id, amountCents: t.priceCents, status: 'pending' }
  })
  const base = process.env.PUBLIC_BASE_URL || ''
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
    return NextResponse.json({ error: '下单失败：' + (e?.message ?? e) }, { status: 502 })
  }
}
