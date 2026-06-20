import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { getConfig } from '@/lib/config'
import { checkPrompt } from '@/lib/moderation'
import { checkScope, latestUserText } from '@/lib/wsScope'
import { agentChat, estimateTokens, type RawMessage } from '@/lib/wsRelay'
import { refillIfNeeded, wsQuotaStatus, consumeTokens } from '@/lib/wsQuota'
import { getCached, getInflight, userIsBusy, runOnce, type GenOut } from '@/lib/inflight'
import { prisma } from '@/lib/db'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function hasImage(messages: RawMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && (m.content as any[]).some((p) => p?.type === 'image_url')
  )
}

// 翰文：服务端代发对话（带工具调用）。客户端工具在本机执行，每一步 LLM 调用经此计费。
export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录', needLogin: true }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const messages: RawMessage[] = Array.isArray(body.messages) ? body.messages : []
  const tools = Array.isArray(body.tools) ? body.tools : undefined
  const rid = typeof body.reqId === 'string' && body.reqId ? body.reqId : crypto.randomUUID()
  if (messages.length === 0) return NextResponse.json({ error: '空请求' }, { status: 400 })

  // 幂等：重试复用同一轮结果，避免重复扣费
  const cached = getCached(rid)
  if (cached) return NextResponse.json(cached.body, { status: cached.status })
  const flight = getInflight(rid)
  if (flight) {
    const r = await flight
    return NextResponse.json(r.body, { status: r.status })
  }
  if (userIsBusy(u.id)) {
    return NextResponse.json({ error: '上一条还在处理中，请稍候' }, { status: 429 })
  }

  const out: GenOut = await runOnce(rid, u.id, async () => {
    const userText = latestUserText(messages)

    // 文员范围审核 + 内容审核（命中不调用、不扣费、留痕）
    const scope = await checkScope(messages)
    const mod = scope.blocked ? { blocked: false } : await checkPrompt(userText)
    if (scope.blocked || mod.blocked) {
      await prisma.agentLog
        .create({
          data: {
            userId: u.id,
            model: '',
            ok: false,
            tokens: 0,
            source: 'member',
            scopeBlocked: true,
            error: scope.blocked ? '越界:' + scope.word : '违规:' + (mod as any).word
          }
        })
        .catch(() => {})
      return {
        status: 400,
        body: {
          scopeBlocked: true,
          error: scope.blocked
            ? '抱歉，我只能帮你处理文书/文员相关的工作（做单据、转格式、套模板、合同审查等）。这个请求超出了范围。'
            : '请求包含不当内容，已被拦截。'
        }
      }
    }

    // 周额度刷新 + 判定
    const fresh = (await refillIfNeeded(u.id)) || u
    const q = wsQuotaStatus(fresh)
    if (!q.canUse) {
      return {
        status: 402,
        body: {
          needRecharge: true,
          quota: q,
          error: q.active ? '本周额度已用完，下周自动恢复，或升级套餐。' : '会员已到期，请续费后继续。'
        }
      }
    }

    // 全站每日 token 上限（成本护栏）
    const cap = Number(await getConfig('ws_daily_token_cap')) || 0
    if (cap > 0) {
      const agg = await prisma.agentLog.aggregate({
        where: { ok: true, createdAt: { gte: startOfToday() } },
        _sum: { tokens: true }
      })
      if ((agg._sum.tokens || 0) >= cap) {
        return { status: 503, body: { error: '今日使用量已达系统上限，请稍后再试' } }
      }
    }

    // 强制服务端模型（忽略客户端传值）
    const model = hasImage(messages)
      ? await getConfig('ws_vision_model')
      : await getConfig('ws_chat_model')

    const t0 = Date.now()
    const r = await agentChat({ messages, tools, model })
    const ms = Date.now() - t0
    const tokens = r.ok ? r.usage?.total_tokens ?? estimateTokens(messages, r.message) : 0

    await prisma.agentLog
      .create({
        data: {
          userId: u.id,
          model,
          ok: r.ok,
          tokens,
          source: 'member',
          error: r.ok ? null : (r.error ?? '').slice(0, 500),
          ms
        }
      })
      .catch(() => {})

    if (!r.ok) return { status: 502, body: { error: r.error || 'AI 暂时不可用' } }

    await consumeTokens(u.id, tokens)
    const after = (await prisma.user.findUnique({ where: { id: u.id } }))!
    return {
      status: 200,
      body: { ok: true, message: r.message, usage: { total_tokens: tokens }, quota: wsQuotaStatus(after) }
    }
  })

  return NextResponse.json(out.body, { status: out.status })
}
