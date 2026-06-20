import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/admin'
import { prisma } from '@/lib/db'

export async function GET(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const userCount = await prisma.user.count()
  const paidCount = await prisma.order.count({ where: { status: 'paid' } })
  return NextResponse.json({ orders, stats: { userCount, paidCount } })
}
