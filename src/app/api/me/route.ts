import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { quotaStatus } from '@/lib/quota'
import { ensureInviteCode } from '@/lib/invite'

export async function GET(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const q = await quotaStatus(u)
  const inviteCode = await ensureInviteCode(u.id).catch(() => u.inviteCode || '')
  return NextResponse.json({ phone: u.phone, ...q, inviteCode, inviteCount: u.inviteCount })
}
