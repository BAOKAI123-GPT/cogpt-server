import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/admin'
import { prisma } from '@/lib/db'
import { getWsTiers } from '@/lib/config'

const MONTH_MS = 30 * 24 * 3600 * 1000

// 用户列表 / 搜索
export async function GET(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('q')?.trim() || ''
  const users = await prisma.user.findMany({
    where: q ? { phone: { contains: q } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100
  })
  return NextResponse.json({ users })
}

// 管理操作：开关会员 / 加减次数 / 封禁
export async function POST(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { action, userId, value, tier } = await req.json().catch(() => ({}))
  const user = await prisma.user.findUnique({ where: { id: String(userId || '') } })
  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

  if (action === 'addCredits') {
    const v = Number(value) || 0
    const active = !!user.memberExpiresAt && user.memberExpiresAt.getTime() > Date.now()
    const data: { memberCredits: number; memberExpiresAt?: Date; memberTier?: string } = {
      memberCredits: Math.max(0, user.memberCredits + v)
    }
    // 加额度时若会员未生效，则自动开通一个月，让加的额度立刻可用（额度只有在会员有效期内才算数）
    if (v > 0 && !active) {
      data.memberExpiresAt = new Date(Date.now() + MONTH_MS)
      if (user.memberTier === 'none') data.memberTier = 'basic'
    }
    await prisma.user.update({ where: { id: user.id }, data })
  } else if (action === 'setMember') {
    // 手动开通会员：给定档位，延长一个月
    await prisma.user.update({
      where: { id: user.id },
      data: { memberTier: String(tier || 'basic'), memberExpiresAt: new Date(Date.now() + MONTH_MS) }
    })
  } else if (action === 'cancelMember') {
    await prisma.user.update({ where: { id: user.id }, data: { memberTier: 'none', memberExpiresAt: null } })
  } else if (action === 'disable') {
    await prisma.user.update({ where: { id: user.id }, data: { disabled: !!value } })
  } else if (action === 'addWsTokens') {
    // 翰文：手动加本周 token
    await prisma.user.update({ where: { id: user.id }, data: { wsWeekTokens: { increment: Number(value) || 0 } } })
  } else if (action === 'setWsMember') {
    // 翰文：手动开通会员，延长一个月、开本周额度
    const t = (await getWsTiers()).find((x) => x.id === String(tier || 'basic'))
    await prisma.user.update({
      where: { id: user.id },
      data: {
        wsTier: String(tier || 'basic'),
        wsExpiresAt: new Date(Date.now() + MONTH_MS),
        wsWeekStart: new Date(),
        wsWeekTokens: t ? t.weekTokens : 0
      }
    })
  } else if (action === 'cancelWsMember') {
    await prisma.user.update({ where: { id: user.id }, data: { wsTier: 'none', wsExpiresAt: null, wsWeekTokens: 0 } })
  } else {
    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, user: await prisma.user.findUnique({ where: { id: user.id } }) })
}
