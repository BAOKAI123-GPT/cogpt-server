import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { verifyPassword, totpKeyuri } from '@/lib/admin'

// 用账号密码换取 2FA 绑定二维码（首次在认证器里添加用）
export async function POST(req: Request): Promise<Response> {
  // 安全：默认关闭。否则任何知道管理员密码者都能换取 2FA 种子、绕过双因子。
  // 确需重新绑定时，临时设置环境变量 ADMIN_ENROLL=1 重启即可。
  if (process.env.ADMIN_ENROLL !== '1') {
    return NextResponse.json({ error: '2FA 绑定通道已关闭' }, { status: 403 })
  }
  const { username, password } = await req.json().catch(() => ({}))
  const admin = await prisma.admin.findUnique({ where: { username: String(username || '') } })
  if (!admin || !verifyPassword(String(password || ''), admin.passwordHash)) {
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 })
  }
  const otpauth = totpKeyuri(admin.username, admin.totpSecret)
  const qr = await QRCode.toDataURL(otpauth)
  return NextResponse.json({ ok: true, otpauth, qr, secret: admin.totpSecret })
}
