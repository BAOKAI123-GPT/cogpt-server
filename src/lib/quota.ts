import type { User } from '@prisma/client'
import { prisma } from './db'
import { getConfig } from './config'

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function memberActive(u: User): boolean {
  return !!u.memberExpiresAt && new Date(u.memberExpiresAt).getTime() > Date.now()
}

export interface QuotaStatus {
  memberActive: boolean
  memberTier: string
  memberCredits: number
  memberExpiresAt: string | null
  bonusCredits: number
  freeRemaining: number
  freeDaily: number
  canGenerate: boolean
  source: 'member' | 'bonus' | 'free' | null
}

export async function quotaStatus(user: User, need = 1): Promise<QuotaStatus> {
  const freeDaily = Number(await getConfig('free_daily')) || 0
  const active = memberActive(user)
  const freeUsedToday = user.freeDate === today() ? user.freeUsed : 0
  const freeRemaining = Math.max(0, freeDaily - freeUsedToday)
  // 优先级：会员付费额度 → 赠送(拉新)额度 → 每日免费。need=本次要扣的额度(高质量=2)，单一来源需能覆盖。
  const n = Math.max(1, need)
  let source: 'member' | 'bonus' | 'free' | null = null
  if (active && user.memberCredits >= n) source = 'member'
  else if (user.bonusCredits >= n) source = 'bonus'
  else if (freeRemaining >= n) source = 'free'
  return {
    memberActive: active,
    memberTier: active ? user.memberTier : 'none',
    memberCredits: active ? user.memberCredits : 0,
    memberExpiresAt: user.memberExpiresAt ? user.memberExpiresAt.toISOString() : null,
    bonusCredits: user.bonusCredits,
    freeRemaining,
    freeDaily,
    canGenerate: source !== null,
    source
  }
}

/** 生图成功后扣 credits 次（高质量=2，标准=1；失败不调用 = 失败不扣） */
export async function consume(userId: string, credits = 1): Promise<void> {
  const n = Math.max(1, credits)
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) return
  const s = await quotaStatus(u, n)
  if (s.source === 'member') {
    await prisma.user.update({ where: { id: userId }, data: { memberCredits: { decrement: n } } })
  } else if (s.source === 'bonus') {
    await prisma.user.update({ where: { id: userId }, data: { bonusCredits: { decrement: n } } })
  } else if (s.source === 'free') {
    if (u.freeDate === today()) {
      await prisma.user.update({ where: { id: userId }, data: { freeUsed: { increment: n } } })
    } else {
      await prisma.user.update({ where: { id: userId }, data: { freeDate: today(), freeUsed: n } })
    }
  }
}

/** GPT 对话扣 0.5 次：累加半次，满 1 次扣 1（即每 2 次对话扣 1 次生图额度） */
export async function consumeHalf(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) return
  if (u.chatHalf >= 1) {
    await prisma.user.update({ where: { id: userId }, data: { chatHalf: 0 } })
    await consume(userId) // 第二个半次 → 实际扣 1 次
  } else {
    await prisma.user.update({ where: { id: userId }, data: { chatHalf: 1 } })
  }
}
