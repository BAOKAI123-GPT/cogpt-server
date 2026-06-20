import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { refillIfNeeded, wsQuotaStatus } from '@/lib/wsQuota'

export async function GET(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录', needLogin: true }, { status: 401 })
  const fresh = (await refillIfNeeded(u.id)) || u
  return NextResponse.json({ phone: u.phone, ...wsQuotaStatus(fresh) })
}
