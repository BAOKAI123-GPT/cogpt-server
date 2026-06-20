import type { User } from '@prisma/client'
import { prisma } from './db'
import { getWsTiers } from './config'

const WEEK_MS = 7 * 24 * 3600 * 1000

export function wsMemberActive(u: User): boolean {
  return !!u.wsExpiresAt && new Date(u.wsExpiresAt).getTime() > Date.now()
}

export interface WsQuotaStatus {
  active: boolean
  tier: string
  weekTokens: number // 本周剩余
  weekResetAt: string | null // 下次刷新时间
  expiresAt: string | null // 订阅到期
  canUse: boolean
}

async function tierWeekTokens(tierId: string): Promise<number> {
  const t = (await getWsTiers()).find((x) => x.id === tierId)
  return t ? t.weekTokens : 0
}

/**
 * 每周刷新：会员有效且已过一个完整 7 天窗口，则把本周额度重置为该档周额度（不结转），
 * 并把窗口起点前进整数周。返回最新的 user。
 */
export async function refillIfNeeded(userId: string): Promise<User | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) return null
  if (!wsMemberActive(u)) return u

  const now = Date.now()
  if (!u.wsWeekStart) {
    // 异常兜底：会员有效却无窗口起点 → 开一个新窗口
    const week = await tierWeekTokens(u.wsTier)
    return prisma.user.update({
      where: { id: userId },
      data: { wsWeekStart: new Date(now), wsWeekTokens: week }
    })
  }
  const start = new Date(u.wsWeekStart).getTime()
  const weeks = Math.floor((now - start) / WEEK_MS)
  if (weeks >= 1) {
    const week = await tierWeekTokens(u.wsTier)
    return prisma.user.update({
      where: { id: userId },
      data: { wsWeekStart: new Date(start + weeks * WEEK_MS), wsWeekTokens: week }
    })
  }
  return u
}

export function wsQuotaStatus(user: User): WsQuotaStatus {
  const active = wsMemberActive(user)
  const weekTokens = active ? user.wsWeekTokens : 0
  const resetAt =
    active && user.wsWeekStart ? new Date(new Date(user.wsWeekStart).getTime() + WEEK_MS) : null
  return {
    active,
    tier: active ? user.wsTier : 'none',
    weekTokens,
    weekResetAt: resetAt ? resetAt.toISOString() : null,
    expiresAt: user.wsExpiresAt ? user.wsExpiresAt.toISOString() : null,
    canUse: active && weekTokens > 0
  }
}

/** 成功对话后扣本周 token（失败不调用 = 失败不扣），扣到 0 为止不为负 */
export async function consumeTokens(userId: string, n: number): Promise<void> {
  if (n <= 0) return
  await prisma.user.update({ where: { id: userId }, data: { wsWeekTokens: { decrement: n } } })
  await prisma.user.updateMany({ where: { id: userId, wsWeekTokens: { lt: 0 } }, data: { wsWeekTokens: 0 } })
}
