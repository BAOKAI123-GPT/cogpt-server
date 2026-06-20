import { NextResponse } from 'next/server'
import { issueCode } from '@/lib/sms'

const PHONE = /^1[3-9]\d{9}$/

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(req: Request): Promise<Response> {
  const { phone } = await req.json().catch(() => ({}))
  if (typeof phone !== 'string' || !PHONE.test(phone)) {
    return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 })
  }
  const r = await issueCode(phone, clientIp(req))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
