import { NextResponse } from 'next/server'
import { checkCode } from '@/lib/sms'
import { prisma } from '@/lib/db'
import { issueToken } from '@/lib/auth'
import { ensureInviteCode, applyInvite } from '@/lib/invite'

const PHONE = /^1[3-9]\d{9}$/

export async function POST(req: Request): Promise<Response> {
  const { phone, code, invite } = await req.json().catch(() => ({}))
  if (typeof phone !== 'string' || !PHONE.test(phone)) {
    return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 })
  }
  if (!(await checkCode(phone, String(code || '')))) {
    return NextResponse.json({ error: '验证码错误或已过期' }, { status: 400 })
  }
  // 无感注册：号码不存在则自动建号（初始 0 会员额度）
  let user = await prisma.user.findUnique({ where: { phone } })
  let isNew = false
  if (!user) {
    user = await prisma.user.create({ data: { phone } })
    isNew = true
  }
  if (user.disabled) return NextResponse.json({ error: '账号已被禁用' }, { status: 403 })
  // 新注册：生成本人邀请码；如填了邀请码则发放拉新奖励（被拉+10、邀请人+30）
  let invited = false
  if (isNew) {
    await ensureInviteCode(user.id).catch(() => {})
    if (typeof invite === 'string' && invite.trim()) {
      const r = await applyInvite(user.id, invite).catch(() => null)
      invited = !!r?.ok
    }
  }
  return NextResponse.json({ ok: true, token: issueToken(user.id), isNew, invited })
}
