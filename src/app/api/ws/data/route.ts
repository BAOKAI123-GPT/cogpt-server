import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const KINDS = ['memory', 'info']

// 拉取某类用户数据（记忆库/信息库），跨端同步用
export async function GET(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const kind = new URL(req.url).searchParams.get('kind') || ''
  if (!KINDS.includes(kind)) return NextResponse.json({ error: '未知数据类型' }, { status: 400 })
  const row = await prisma.wsUserData.findUnique({ where: { userId_kind: { userId: u.id, kind } } })
  return NextResponse.json({ ok: true, json: row?.json ?? '[]', updatedAt: row?.updatedAt ?? null })
}

// 上传/覆盖某类用户数据（整表 JSON，last-write-wins）
export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { kind, json } = await req.json().catch(() => ({}))
  if (!KINDS.includes(kind) || typeof json !== 'string') return NextResponse.json({ error: '参数有误' }, { status: 400 })
  if (json.length > 3_000_000) return NextResponse.json({ error: '数据过大' }, { status: 413 })
  await prisma.wsUserData.upsert({
    where: { userId_kind: { userId: u.id, kind } },
    create: { userId: u.id, kind, json },
    update: { json }
  })
  return NextResponse.json({ ok: true })
}
