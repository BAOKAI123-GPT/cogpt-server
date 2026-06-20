import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { prisma } from './db'

authenticator.options = { window: 1 } // 容忍 ±30s 时钟偏差

export const ADMIN_COOKIE = 'cogpt_admin'
function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET 未配置或过短')
    return 'dev-insecure-secret'
  }
  return s
}

export function hashPassword(p: string): string {
  return bcrypt.hashSync(p, 10)
}
export function verifyPassword(p: string, hash: string): boolean {
  return bcrypt.compareSync(p, hash)
}
export function genTotpSecret(): string {
  return authenticator.generateSecret()
}
export function totpKeyuri(user: string, secretB32: string): string {
  return authenticator.keyuri(user, 'cogpt', secretB32)
}
export function verifyTotp(token: string, secretB32: string): boolean {
  try {
    return authenticator.check(token, secretB32)
  } catch {
    return false
  }
}
export function issueAdminToken(adminId: string): string {
  return jwt.sign({ adm: adminId }, secret(), { expiresIn: '12h' })
}

export async function currentAdmin(req: Request) {
  const cookie = req.headers.get('cookie') || ''
  const m = /(?:^|;\s*)cogpt_admin=([^;]+)/.exec(cookie)
  if (!m) return null
  try {
    const p = jwt.verify(decodeURIComponent(m[1]), secret()) as { adm?: string }
    if (!p.adm) return null
    return await prisma.admin.findUnique({ where: { id: p.adm } })
  } catch {
    return null
  }
}
