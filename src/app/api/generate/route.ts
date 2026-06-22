import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { quotaStatus, consume } from '@/lib/quota'
import { generate } from '@/lib/relay'
import { getConfig } from '@/lib/config'
import { checkPrompt } from '@/lib/moderation'
import { getCached, getInflight, userActiveCount, runOnce, type GenOut } from '@/lib/inflight'
import { prisma } from '@/lib/db'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 发往中转站的提示词上限：超长 prompt 会显著拉高上游推理耗时、容易触发超时。
// 超过则截断保留前部（已是较宽松的上限，正常创作不会触达）。
const MAX_PROMPT_CHARS = 4000

// 把上游英文/技术错误映射成用户能懂的中文提示；保留原文进日志（GenLog + pm2 relay-fail 仍是原始英文）。
function friendlyError(raw?: string): string {
  const e = String(raw || '')
  const low = e.toLowerCase()
  // 安全策略拒绝（429 安全拒绝 / "rejected by the safety" / "safety"）
  if (/rejected by the safety|safety system|safety|content_policy|content policy|违规|敏感/i.test(e))
    return '提示词或参考图被安全策略拒绝，请调整内容后重试'
  // 尺寸/比例不被该上游支持（"size must be one of ..." / "Invalid size"）
  if (/size must be one of|invalid size|unsupported size|不支持.*尺寸|不支持.*size/i.test(e))
    return '当前比例该模型暂不支持，请换 1:1 / 2:3 / 3:2 后重试'
  // 上游饱和/排队（"负载已饱和" / overloaded / rate limit / busy）
  if (/负载已饱和|overloaded|rate.?limit|too many requests|server is busy|busy|繁忙|饱和/i.test(low + e))
    return '当前生图通道繁忙，请稍后再试或换个模型'
  // 上游超时
  if (/timeout|timed out|超时/i.test(low))
    return '生图超时了，可能是网络或上游繁忙，请稍后再试'
  // 其余保持原文（已是中文为主的友好文案，如"当前模型暂无支持…画幅的中转站"）
  return e || '生成失败，请稍后再试'
}

export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { prompt, size, model, initImages, mask, reqId, hdEdge } = body
  const rid = typeof reqId === 'string' && reqId ? reqId : crypto.randomUUID()

  // —— 幂等：命中缓存/在途，直接复用，避免重试重复生成与重复扣费 ——
  const cached = getCached(rid)
  if (cached) return NextResponse.json(cached.body, { status: cached.status })
  const flight = getInflight(rid)
  if (flight) {
    const r = await flight
    return NextResponse.json(r.body, { status: r.status })
  }
  // 每用户并发上限（默认 3，后台 user_concurrency 可调）：允许同一账号同时生成多张、中止后立刻能开下一张；
  // 不同账号天然互不影响。仍保留全站每日上限(daily_gen_cap)防成本失控。
  const cap = Number(await getConfig('user_concurrency')) || 3
  if (userActiveCount(u.id) >= cap) {
    return NextResponse.json({ error: '您同时进行的生成已达上限，请等其中一张完成再试' }, { status: 429 })
  }

  const out: GenOut = await runOnce(rid, u.id, cap, async (signal) => {
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

    // 参考图白名单：只有支持改图的模型(gpt-image-2)才接受参考图；其它模型带参考图直接友好拦截，避免走 edits 报错。
    if (hasRef) {
      let refModels: string[] = []
      try {
        const v = JSON.parse((await getConfig('ref_models')) || '[]')
        if (Array.isArray(v)) refModels = v.map((x) => String(x))
      } catch {
        refModels = []
      }
      if (!refModels.includes(useModel)) {
        return { status: 400, body: { error: '该模型不支持上传参考图，请切换到「高质量GPT」再用参考图生成' } }
      }
    }

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

    // 提示词上限：超长 prompt 会拖垮上游推理、易超时。超过则截断保留前部并记录。
    if (promptStr.length > MAX_PROMPT_CHARS) {
      console.warn('[generate] prompt 超长已截断', { userId: u.id, model, origLen: promptStr.length, max: MAX_PROMPT_CHARS })
      promptStr = promptStr.slice(0, MAX_PROMPT_CHARS)
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

    // —— 本次扣多少点数（方案B 点数制）：基础(按模型) + 多参考图加价 + 高清加价 ——
    // 标准10 / 高质量GPT20 / Gemini30；多1张参考图+ref_extra_points；高清按 hdEdge 阈值加点。
    let credits = 10
    try {
      const mc = JSON.parse((await getConfig('model_credits')) || '{}')
      if (typeof mc?.[useModel] === 'number' && mc[useModel] > 0) credits = mc[useModel]
    } catch {
      /* 默认 10 */
    }
    // 多参考图：>1 张时每多 1 张加点（首张不加）
    if (hasRef && initImages.length > 1) {
      const refExtra = Number(await getConfig('ref_extra_points')) || 0
      credits += refExtra * (initImages.length - 1)
    }
    // 高清：客户端传 hdEdge(目标长边像素)，取 hdEdge≥阈值中的最大加点。高清=本地放大无API成本，属可调利润杠杆。
    const edge = Number(hdEdge) || 0
    if (edge > 0) {
      try {
        const hs = JSON.parse((await getConfig('hd_surcharge')) || '{}')
        let add = 0
        for (const [thr, pts] of Object.entries(hs)) {
          if (edge >= Number(thr) && Number(pts) > add) add = Number(pts)
        }
        credits += add
      } catch {
        /* 无高清加价 */
      }
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
      // —— 失败兜底：所选模型在所有中转站都失败时，用最稳的兜底模型(默认 z-image-turbo，6s 双站)补出一张，
      //    尽量不让用户空手而归。仅在：非用户中止、非参考图改图(兜底为纯文生图)、非安全/违规拒绝、
      //    且仍有时间(elapsed<72s，留足时间给兜底，防超 Cloudflare ~100s) 时启用。按兜底模型实际计费。 ——
      const fbModel = (await getConfig('fallback_model')) || ''
      const safetyBlocked = /safety|rejected by the safety|content.?policy|内容|违规|敏感/i.test(r.error || '')
      const canFallback =
        !!fbModel && fbModel !== useModel && allowed.includes(fbModel) &&
        !r.aborted && !hasRef && !safetyBlocked && Date.now() - t0 < 72_000
      if (canFallback) {
        let fbCredits = 10
        try {
          const mc = JSON.parse((await getConfig('model_credits')) || '{}')
          if (typeof mc?.[fbModel] === 'number' && mc[fbModel] > 0) fbCredits = mc[fbModel]
        } catch {
          /* 默认 10 */
        }
        const q2 = await quotaStatus(u, fbCredits)
        if (q2.canGenerate) {
          const tf = Date.now()
          const rf = await generate({ prompt: promptStr, size: typeof size === 'string' ? size : undefined, model: fbModel }, signal)
          await prisma.genLog
            .create({
              data: {
                userId: u.id, model: fbModel, ok: rf.ok, source: q2.source || 'free',
                error: rf.ok ? null : ('兜底失败:' + (rf.error ?? '')).slice(0, 500),
                ms: Date.now() - tf, relayId: rf.relayId ?? null, prompt: promptStr.slice(0, 500)
              }
            })
            .catch(() => {})
          if (rf.ok) {
            await consume(u.id, fbCredits)
            const freshF = await prisma.user.findUnique({ where: { id: u.id } })
            const afterF = freshF ? await quotaStatus(freshF) : q2
            // fallback 标记：客户端可提示"原模型繁忙，已用极速模型为你生成"
            return { status: 200, body: { ok: true, images: rf.images, text: rf.text, quota: afterF, fallback: true, fallbackModel: fbModel } }
          }
        }
      }
      // 失败不扣额度（也不缓存，允许客户端重试）。原始错误已落 GenLog + pm2，返回前端用友好中文。
      return { status: 502, body: { error: friendlyError(r.error) } }
    }
    await consume(u.id, credits)
    const fresh = await prisma.user.findUnique({ where: { id: u.id } })
    const after = fresh ? await quotaStatus(fresh) : q
    return { status: 200, body: { ok: true, images: r.images, text: r.text, quota: after } }
  })

  return NextResponse.json(out.body, { status: out.status })
}
