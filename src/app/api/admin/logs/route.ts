import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/admin'
import { prisma } from '@/lib/db'

// 生图日志查询（含失败原因、耗时），仅管理员可见
export async function GET(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const only = url.searchParams.get('only') || '' // '' | 'fail' | 'ok'
  const phone = (url.searchParams.get('q') || '').trim()

  const where: { ok?: boolean; userId?: string } = {}
  if (only === 'fail') where.ok = false
  if (only === 'ok') where.ok = true
  if (phone) {
    const u = await prisma.user.findUnique({ where: { phone } })
    where.userId = u ? u.id : '__none__'
  }

  const logs = await prisma.genLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { phone: true } } }
  })
  const total = await prisma.genLog.count()
  const failCount = await prisma.genLog.count({ where: { ok: false } })

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      phone: l.user?.phone ?? '-',
      model: l.model,
      ok: l.ok,
      source: l.source,
      error: l.error,
      ms: l.ms,
      createdAt: l.createdAt
    })),
    stats: { total, failCount }
  })
}
