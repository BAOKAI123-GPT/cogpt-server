import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/admin'
import { getRelayBalances } from '@/lib/relayBalance'

// 后台 RelayManager 用：各中转站余额（1小时缓存；?force=1 强制刷新）。
export async function GET(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const force = new URL(req.url).searchParams.get('force') === '1'
  const { updatedAt, balances } = await getRelayBalances(force)
  return NextResponse.json({ updatedAt, balances })
}
