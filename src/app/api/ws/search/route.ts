import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { webSearch, fetchPageText } from '@/lib/wsSearch'

// 每用户限速：60s 内最多 40 次（防被当作免费爬虫/带宽滥用）。进程内即可。
const hits = new Map<string, number[]>()
function rateLimited(userId: string, max = 40, windowMs = 60000): boolean {
  const now = Date.now()
  const arr = (hits.get(userId) || []).filter((t) => now - t < windowMs)
  arr.push(now)
  hits.set(userId, arr)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
  return arr.length > max
}

// 翰文：服务端联网搜索（百度/Bing，国内可达）。客户端工具经此调用，避免本机访问被墙的 DuckDuckGo。
export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录', needLogin: true }, { status: 401 })
  if (rateLimited(u.id)) return NextResponse.json({ ok: false, error: '搜索太频繁，请稍后再试' }, { status: 429 })
  const body = await req.json().catch(() => ({}))

  try {
    // 模式一：取某个网页正文
    if (typeof body.url === 'string' && body.url) {
      const text = await fetchPageText(body.url, Math.min(Number(body.maxChars) || 4000, 8000))
      return NextResponse.json({ ok: true, text })
    }
    // 模式二：搜索
    const q = String(body.query || '').trim()
    if (!q) return NextResponse.json({ ok: false, error: '空查询' }, { status: 400 })
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 12)
    const hits = await webSearch(q, limit)
    let pages: string[] | undefined
    if (body.withPages) {
      pages = (
        await Promise.all(hits.slice(0, 2).map((h) => fetchPageText(h.url, 2500).catch(() => '')))
      ).filter(Boolean)
    }
    return NextResponse.json({ ok: true, hits, pages })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: '联网搜索失败：' + (e?.message ?? e) }, { status: 502 })
  }
}
