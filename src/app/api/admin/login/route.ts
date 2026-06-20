import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, verifyTotp, issueAdminToken, ADMIN_COOKIE } from '@/lib/admin'

export async function POST(req: Request): Promise<Response> {
  const { username, password, token } = await req.json().catch(() => ({}))
  const admin = await prisma.admin.findUnique({ where: { username: String(username || '') } })
  if (!admin || !verifyPassword(String(password || ''), admin.passwordHash)) {
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 })
  }
  if (!verifyTotp(String(token || ''), admin.totpSecret)) {
    return NextResponse.json({ error: '两步验证码错误' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, issueAdminToken(admin.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 12 * 3600
  })
  return res
}
