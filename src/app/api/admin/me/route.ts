import { NextResponse } from 'next/server'
import { currentAdmin, ADMIN_COOKIE } from '@/lib/admin'

export async function GET(req: Request): Promise<Response> {
  const a = await currentAdmin(req)
  if (!a) return NextResponse.json({ error: '未登录' }, { status: 401 })
  return NextResponse.json({ ok: true, username: a.username })
}

export async function DELETE(): Promise<Response> {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
