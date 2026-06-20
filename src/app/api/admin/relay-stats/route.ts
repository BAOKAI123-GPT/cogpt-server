import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/admin'
import { relayStats } from '@/lib/relay'

// 后台 RelayManager 用：近 24h 每个中转站的成功率 + 平均耗时（驱动自动排序，也供后台查看）。
export async function GET(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  return NextResponse.json({ stats: await relayStats() })
}
