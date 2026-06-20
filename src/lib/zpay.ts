import { createHash } from 'node:crypto'

// zpay（彩虹易支付）支付宝下单 + 验签。见 docs/zpay易支付接入手册。
const ENDPOINT = 'https://z-pay.cn/mapi.php'
const pid = (): string => process.env.ZPAY_PID || ''
const key = (): string => process.env.ZPAY_KEY || ''

// 签名：排除 sign/sign_type/空值 → key ASCII 升序 → 拼 k=v& → 末尾直接拼 KEY → md5 小写
export function zpaySign(
  params: Record<string, string | number | undefined | null>,
  mchKey: string
): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type')
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
  const str = keys.map((k) => `${k}=${params[k]}`).join('&')
  return createHash('md5').update(str + mchKey, 'utf8').digest('hex')
}

export function verifyZpayNotify(params: Record<string, string | undefined>): boolean {
  const given = params['sign']
  if (typeof given !== 'string' || !given) return false
  return zpaySign(params, key()) === given.toLowerCase()
}

// 金额比对：把易支付返回的元金额(可能是 "9.9"/"9.90"/"0.01")按"分"做数值比较，
// 避免字符串比较把 "9.9" 和 "9.90" 当成不等而漏单。返回是否与期望分值一致。
export function moneyMatchesCents(money: string | number | undefined | null, amountCents: number): boolean {
  const n = Number(money)
  if (!Number.isFinite(n)) return false
  return Math.round(n * 100) === amountCents
}

export interface ZpayOrderInput {
  outTradeNo: string
  moneyYuan: string
  name: string
  notifyUrl: string
  returnUrl?: string
}
export interface ZpayOrderResult {
  payUrl: string
  qrcode?: string
  img?: string
  tradeNo?: string
}

// 主动查单（资金兜底）：当回调因网络/隧道异常未到时，前端轮询时由后端主动向 zpay 核对。
// GET https://z-pay.cn/api.php?act=order&pid=&key=&out_trade_no=  → { code:1, status:1=已付, money, trade_no }
export async function queryZpayOrder(
  outTradeNo: string
): Promise<{ paid: boolean; money?: string; tradeNo?: string } | null> {
  if (!pid() || !key()) return null
  const url = `https://z-pay.cn/api.php?act=order&pid=${encodeURIComponent(pid())}&key=${encodeURIComponent(
    key()
  )}&out_trade_no=${encodeURIComponent(outTradeNo)}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    if (Number(j.code) !== 1) return null
    return {
      paid: Number(j.status) === 1,
      money: j.money ? String(j.money) : undefined,
      tradeNo: j.trade_no ? String(j.trade_no) : undefined
    }
  } catch {
    return null
  }
}

export async function createZpayOrder(x: ZpayOrderInput): Promise<ZpayOrderResult> {
  if (!pid() || !key()) throw new Error('zpay 未配置 PID/KEY')
  const params: Record<string, string> = {
    pid: pid(),
    type: 'alipay',
    out_trade_no: x.outTradeNo,
    notify_url: x.notifyUrl,
    name: x.name,
    money: x.moneyYuan,
    ...(x.returnUrl ? { return_url: x.returnUrl } : {})
  }
  params.sign = zpaySign(params, key())
  params.sign_type = 'MD5'
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  if (!res.ok) throw new Error(`zpay http ${res.status}`)
  const j = (await res.json()) as Record<string, unknown>
  if (Number(j.code) !== 1) throw new Error(`zpay code ${j.code}: ${j.msg}`)
  return {
    payUrl: String(j.payurl ?? ''),
    qrcode: j.qrcode ? String(j.qrcode) : undefined,
    img: j.img ? String(j.img) : undefined,
    tradeNo: j.trade_no ? String(j.trade_no) : undefined
  }
}
