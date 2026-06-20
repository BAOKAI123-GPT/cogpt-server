import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { quotaStatus, consume } from '@/lib/quota'
import { generate } from '@/lib/relay'
import { getConfig } from '@/lib/config'
import { checkPrompt } from '@/lib/moderation'
import { getCached, getInflight, userIsBusy, runOnce, type GenOut } from '@/lib/inflight'
import { prisma } from '@/lib/db'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { prompt, size, model, initImages, mask, reqId } = body
  const rid = typeof reqId === 'string' && reqId ? reqId : crypto.randomUUID()

  // —— 幂等：命中缓存/在途，直接复用，避免重试重复生成与重复扣费 ——
  const cached = getCached(rid)
  if (cached) return NextResponse.json(cached.body, { status: cached.status })
  const flight = getInflight(rid)
  if (flight) {
    const r = await flight
    return NextResponse.json(r.body, { status: r.status })
  }
  // 同一用户同时只允许一张在生成（防突发刷量）
  if (userIsBusy(u.id)) {
    return NextResponse.json({ error: '您有一张图正在生成中，请稍候' }, { status: 429 })
  }

  const out: GenOut = await runOnce(rid, u.id, async (signal) => {
    // 模型必须在后台开放列表内
    let allowed: string[] = []
    try {
      allowed = JSON.parse(await getConfig('allowed_models'))
    } catch {
      allowed = []
    }
    const useModel = allowed.includes(model) ? model : allowed[0]
    if (!useModel) return { status: 400, body: { error: '后台未配置可用模型' } }

    let promptStr = String(prompt || '').trim()
    const hasRef = Array.isArray(initImages) && initImages.length > 0

    // gpt-image 即使有参考图也必须带文字描述，否则中转站报 "prompt is required"。
    // 用了参考图但没打字 → 自动补一句默认描述，让"图生图/参考图直接生成"也能成功；
    // 既没文字也没参考图 → 确实没东西可生成，提示用户。
    if (!promptStr) {
      if (hasRef) {
        promptStr = '在保持这张参考图的主体、风格与构图的基础上，生成一张更清晰、更精致的版本'
      } else {
        return { status: 400, body: { error: '请输入图片描述（提示词不能为空）' } }
      }
    }

    // —— 内容审核：命中违规词直接拦截并留痕（不调用中转站、不扣费） ——
    const mod = await checkPrompt(promptStr)
    if (mod.blocked) {
      await prisma.genLog
        .create({
          data: { userId: u.id, model: useModel, ok: false, source: 'free', error: '内容违规:' + mod.word, prompt: promptStr.slice(0, 500) }
        })
        .catch(() => {})
      return { status: 400, body: { error: '提示词包含违规内容，已被拦截，请修改后重试' } }
    }

    // 本次扣多少额度：高质量模型(image2/Nano Banana)=2，标准(light)=1，按 model_credits 配置
    let credits = 1
    try {
      const mc = JSON.parse((await getConfig('model_credits')) || '{}')
      if (typeof mc?.[useModel] === 'number' && mc[useModel] > 0) credits = mc[useModel]
    } catch {
      /* 默认 1 */
    }

    // 额度判定（会员优先，否则每日免费；单一来源需能覆盖本次 credits）
    const q = await quotaStatus(u, credits)
    if (!q.canGenerate) {
      return { status: 402, body: { error: '本月/今日额度已用完，请开通或升级会员', needRecharge: true } }
    }

    // —— 全站每日生图上限（防中转站成本失控） ——
    const cap = Number(await getConfig('daily_gen_cap')) || 0
    if (cap > 0) {
      const todayOk = await prisma.genLog.count({ where: { ok: true, createdAt: { gte: startOfToday() } } })
      if (todayOk >= cap) {
        return { status: 503, body: { error: '今日生成量已达系统上限，请稍后再试' } }
      }
    }

    const t0 = Date.now()
    const r = await generate(
      {
        prompt: promptStr,
        size: typeof size === 'string' ? size : undefined,
        model: useModel,
        initImages: Array.isArray(initImages) ? initImages : undefined,
        mask: typeof mask === 'string' ? mask : undefined
      },
      signal // 来自 runOnce 的中止控制器；客户端调 /api/generate/cancel 即可中止，未出图不进入 consume()、不扣费
    )
    const ms = Date.now() - t0

    await prisma.genLog
      .create({
        data: {
          userId: u.id,
          model: useModel,
          ok: r.ok,
          source: q.source || 'free',
          error: r.ok ? null : (r.error ?? '').slice(0, 500),
          ms,
          relayId: r.relayId ?? null,
          prompt: promptStr.slice(0, 500)
        }
      })
      .catch(() => {})

    if (!r.ok) {
      // 失败不扣额度（也不缓存，允许客户端重试）
      return { status: 502, body: { error: r.error } }
    }
    await consume(u.id, credits)
    const fresh = await prisma.user.findUnique({ where: { id: u.id } })
    const after = fresh ? await quotaStatus(fresh) : q
    return { status: 200, body: { ok: true, images: r.images, text: r.text, quota: after } }
  })

  return NextResponse.json(out.body, { status: out.status })
}
