// 邀请码 / 拉新：每个用户有唯一邀请码；新用户注册填码 → 邀请人 +N 次、被拉 +M 次（次=bonusCredits，随时可用）。
import { prisma } from './db'
import { getConfig } from './config'

// 去掉易混字符（0/O/1/I/L）
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function gen(n = 6): string {
  let s = ''
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/** 确保用户有邀请码，没有就生成一个唯一的并返回 */
export async function ensureInviteCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) throw new Error('user not found')
  if (u.inviteCode) return u.inviteCode
  for (let i = 0; i < 8; i++) {
    const code = gen()
    try {
      await prisma.user.update({ where: { id: userId }, data: { inviteCode: code } })
      return code
    } catch {
      // 邀请码唯一冲突，重试
    }
  }
  throw new Error('invite code generation failed')
}

/** 新用户注册时套用邀请码。只对刚注册、未被邀请过的用户生效；防自邀、防重复。 */
export async function applyInvite(
  newUserId: string,
  rawCode: string
): Promise<{ ok: boolean; referee: number; error?: string }> {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return { ok: false, referee: 0 }
  const refereeBonus = Number(await getConfig('invite_referee_bonus')) || 0
  const referrerBonus = Number(await getConfig('invite_referrer_bonus')) || 0
  const me = await prisma.user.findUnique({ where: { id: newUserId } })
  if (!me || me.invitedBy) return { ok: false, referee: 0, error: '已使用过邀请码' }
  const referrer = await prisma.user.findUnique({ where: { inviteCode: code } })
  if (!referrer || referrer.id === newUserId) return { ok: false, referee: 0, error: '邀请码无效' }
  await prisma.user.update({
    where: { id: newUserId },
    data: { invitedBy: referrer.id, bonusCredits: { increment: refereeBonus } }
  })
  await prisma.user.update({
    where: { id: referrer.id },
    data: { bonusCredits: { increment: referrerBonus }, inviteCount: { increment: 1 } }
  })
  return { ok: true, referee: refereeBonus }
}
