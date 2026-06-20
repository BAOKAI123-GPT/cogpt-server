import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { cancel } from '@/lib/inflight'

// 中止生图：客户端点"中止"时调用，立即中止在途的中转站请求并释放并发锁（未出图即不扣费）。
export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { reqId } = await req.json().catch(() => ({}))
  const ok = cancel(String(reqId || ''), u.id)
  return NextResponse.json({ ok })
}
