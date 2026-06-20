import jwt from 'jsonwebtoken'
import { prisma } from './db'

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    // 生产环境拒绝以公开默认值签发/校验 token（防伪造），fail-closed
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET 未配置或过短')
    return 'dev-insecure-secret-change-me'
  }
  return s
}

export function issueToken(userId: string): string {
  return jwt.sign({ uid: userId }, secret(), { expiresIn: '30d' })
}

export function userIdFromToken(token: string): string | null {
  try {
    const p = jwt.verify(token, secret()) as { uid?: string }
    return p.uid ?? null
  } catch {
    return null
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : null
}

/** 从请求里取出当前登录用户（无效返回 null） */
export async function currentUser(req: Request) {
  const tok = bearer(req)
  if (!tok) return null
  const uid = userIdFromToken(tok)
  if (!uid) return null
  const user = await prisma.user.findUnique({ where: { id: uid } })
  if (!user || user.disabled) return null
  return user
}
