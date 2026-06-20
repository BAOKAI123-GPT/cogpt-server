import { getConfig } from './config'
import { prisma } from './db'

// 参考图在转发到中转站前先压缩（长边≤1024、webp），把 2MB+ 降到 ~200KB，
// 大幅缩短"后端→中转站"的上传耗时，避免参考图生图超过 Cloudflare ~100s 上限而 524。
// sharp 用动态 import（运行时才加载），避免 Next 构建期解析原生模块报错。
async function shrinkForUpload(dataUrl: string): Promise<{ blob: Blob; name: string }> {
  const { mime, buffer } = parseDataUrl(dataUrl)
  try {
    const { default: sharp } = await import('sharp')
    const out = await sharp(buffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    return { blob: new Blob([new Uint8Array(out)], { type: 'image/webp' }), name: 'image.webp' }
  } catch {
    return { blob: new Blob([new Uint8Array(buffer)], { type: mime }), name: 'image.png' }
  }
}

// 生图代理：用后台配置的中转站 URL+Key 代发，客户端永远拿不到密钥。
// 兼容两种接口流：标准图像接口 /v1/images 与对话式 /v1/chat。
function normalizeBaseUrl(raw: string): string {
  let u = (raw || '').trim().replace(/\/+$/, '')
  u = u.replace(/\/v1(?:\/.*)?$/i, '')
  return u.replace(/\/+$/, '')
}
function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}
function parseDataUrl(d: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(d)
  if (!m) throw new Error('无效图片数据')
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
}
function bufToDataUrl(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const mime = res.headers.get('content-type') || 'image/png'
  return bufToDataUrl(Buffer.from(await res.arrayBuffer()), mime)
}
async function withTimeout<T>(ms: number, fn: (s: AbortSignal) => Promise<T>, ext?: AbortSignal): Promise<T> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  const onAbort = (): void => c.abort()
  if (ext) {
    if (ext.aborted) c.abort()
    else ext.addEventListener('abort', onAbort)
  }
  try {
    return await fn(c.signal)
  } finally {
    clearTimeout(t)
    if (ext) ext.removeEventListener('abort', onAbort)
  }
}
// 90s：留在 Cloudflare ~100s 上限之内，卡住时快速失败并交给客户端自动重试，
// 避免旧的 300s 干等（还会长时间占用单用户并发锁，导致重试也被挡）。
const GEN_TIMEOUT = 98_000 // 略低于 Cloudflare ~100s 上限，尽量救回 90–98s 才完成的生图

export interface GenInput {
  prompt: string
  size?: string
  model: string
  initImages?: string[]
  mask?: string
}
export interface GenResult {
  ok: boolean
  images: string[]
  text?: string
  error?: string
  aborted?: boolean
  relayId?: string // 实际成功出图的中转站 id（落库 GenLog，用于每站统计）
  relayMs?: number // 该站本次耗时(ms)
}

async function parseImages(res: Response): Promise<GenResult> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, images: [], error: `生图失败 ${res.status}：${body.slice(0, 300) || res.statusText}` }
  }
  const json: any = await res.json()
  const data: any[] = Array.isArray(json?.data) ? json.data : []
  const images: string[] = []
  for (const it of data) {
    if (it?.b64_json) images.push(bufToDataUrl(Buffer.from(it.b64_json, 'base64')))
    else if (it?.url) {
      try {
        images.push(await urlToDataUrl(it.url))
      } catch {
        /* skip */
      }
    }
  }
  if (!images.length) return { ok: false, images: [], error: '中转站未返回可用图片' }
  return { ok: true, images }
}

async function viaImages(base: string, key: string, model: string, x: GenInput, ext?: AbortSignal): Promise<GenResult> {
  const size = x.size || '1024x1024'
  const imgs = x.initImages ?? []
  if (imgs.length) {
    const form = new FormData()
    if (x.mask) {
      // 局部重绘：保持原图与蒙版精确对齐，不压缩
      const p = parseDataUrl(imgs[0])
      form.append('image', new Blob([new Uint8Array(p.buffer)], { type: p.mime }), 'image.png')
      const pm = parseDataUrl(x.mask)
      form.append('mask', new Blob([new Uint8Array(pm.buffer)], { type: pm.mime }), 'mask.png')
    } else if (imgs.length === 1) {
      // 参考图/图生图：压缩后上传，加快上传、避免超时
      const im = await shrinkForUpload(imgs[0])
      form.append('image', im.blob, im.name)
    } else {
      for (let i = 0; i < imgs.length; i++) {
        const im = await shrinkForUpload(imgs[i])
        form.append('image[]', im.blob, `image_${i}.webp`)
      }
    }
    form.append('model', model)
    form.append('prompt', x.prompt)
    form.append('size', size)
    const res = await withTimeout(
      GEN_TIMEOUT,
      (signal) =>
        fetch(`${base}/v1/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal }),
      ext
    )
    return parseImages(res)
  }
  const res = await withTimeout(
    GEN_TIMEOUT,
    (signal) =>
      fetch(`${base}/v1/images/generations`, {
        method: 'POST',
        headers: authHeaders(key),
        body: JSON.stringify({ model, prompt: x.prompt, size, n: 1 }),
        signal
      }),
    ext
  )
  return parseImages(res)
}

async function viaChat(base: string, key: string, model: string, x: GenInput, ext?: AbortSignal): Promise<GenResult> {
  const content: any[] = [{ type: 'text', text: x.prompt }]
  for (const d of x.initImages ?? []) content.push({ type: 'image_url', image_url: { url: d } })
  const res = await withTimeout(
    GEN_TIMEOUT,
    (signal) =>
      fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: authHeaders(key),
        body: JSON.stringify({ model, messages: [{ role: 'user', content }], stream: false }),
        signal
      }),
    ext
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, images: [], error: `生图失败 ${res.status}：${body.slice(0, 300) || res.statusText}` }
  }
  const json: any = await res.json()
  const msg = json?.choices?.[0]?.message
  let text = ''
  const parts: string[] = []
  if (typeof msg?.content === 'string') {
    text = msg.content
    parts.push(msg.content)
  } else if (Array.isArray(msg?.content)) {
    for (const p of msg.content) {
      if (p?.type === 'text' && p.text) parts.push(p.text)
      if (p?.type === 'image_url' && p.image_url?.url) parts.push(p.image_url.url)
    }
  }
  const re = /(data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+)|(https?:\/\/[^\s)"']+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s)"']*)?)/gi
  const found = new Set<string>()
  let m: RegExpExecArray | null
  const combined = parts.join('\n')
  while ((m = re.exec(combined))) found.add(m[0])
  const images: string[] = []
  for (const u of found) {
    try {
      images.push(u.startsWith('data:') ? u : await urlToDataUrl(u))
    } catch {
      /* skip */
    }
  }
  if (!images.length) return { ok: false, images: [], text, error: '该回复未解析到图片（可能模型非生图）' }
  return { ok: true, images, text }
}

// ===== 多中转站 =====
// 后台可配多个中转站，每个模型按优先级选不同站（前面便宜的失败自动切后面）。
// 接口格式：openai=标准 /v1（青云/云雾）；suchuang=速创异步；highway=接口AI 同步自定义。
// 能力字段：ref=是否支持参考图改图；ratios=支持的画幅(空=全部)；suffix=发给该站时模型名追加(如云雾 :floor 走最便宜)。
type RelayFormat = 'openai' | 'suchuang' | 'highway'
interface RelayCfg {
  id: string
  name: string
  base: string
  key: string
  format: RelayFormat
  ref: boolean
  ratios: string[] // 空数组=支持全部画幅
  suffix: string
  price: number // 该站一张图成本(元)，用于"最便宜优先"自动排序
}

function asFormat(f: any): RelayFormat {
  return f === 'suchuang' || f === 'highway' ? f : 'openai'
}

async function getRelays(): Promise<RelayCfg[]> {
  let arr: any[] = []
  try {
    const v = JSON.parse((await getConfig('relays')) || '[]')
    if (Array.isArray(v)) arr = v
  } catch {
    /* ignore */
  }
  let list: RelayCfg[] = arr
    .filter((r) => r && r.base && r.key)
    .map((r) => {
      const format = asFormat(r.format)
      return {
        id: String(r.id || r.name || r.base),
        name: String(r.name || r.id || ''),
        base: normalizeBaseUrl(String(r.base)),
        key: String(r.key),
        format,
        // 参考图：openai(/v1/images/edits)默认支持；速创/接口AI默认不支持，可被配置覆盖
        ref: typeof r.ref === 'boolean' ? r.ref : format === 'openai',
        ratios: Array.isArray(r.ratios) ? r.ratios.map((s: any) => String(s)) : [],
        suffix: typeof r.suffix === 'string' ? r.suffix : '',
        price: Number(r.price) || 0
      }
    })
  if (!list.length) {
    // 兼容旧的单中转站配置（relay_base_url / relay_api_key）
    const base = normalizeBaseUrl(await getConfig('relay_base_url'))
    const key = await getConfig('relay_api_key')
    if (base && key) list = [{ id: 'default', name: '默认', base, key, format: 'openai', ref: true, ratios: [], suffix: '', price: 0 }]
  }
  return list
}

/** 某模型按优先级排序的中转站列表（model_relays 配置；顺序=优先级，前面失败自动切后面）。 */
async function getModelRelays(model: string): Promise<RelayCfg[]> {
  const relays = await getRelays()
  const byId = new Map(relays.map((r) => [r.id, r]))
  let map: any = {}
  try {
    map = JSON.parse((await getConfig('model_relays')) || '{}')
  } catch {
    /* ignore */
  }
  const ids: string[] = Array.isArray(map?.[model]) ? map[model] : []
  let list = ids.map((id) => byId.get(id)).filter((r): r is RelayCfg => !!r)
  if (!list.length && relays.length) list = [relays[0]] // 未单独配置→用第一个站
  return list
}

/** 该模型是否有支持参考图/改图的中转站（前端据此显隐参考图入口）。 */
export async function modelRefSupported(model: string): Promise<boolean> {
  const list = await getModelRelays(model)
  return list.some((r) => r.ref)
}

async function suchuangEndpoint(model: string): Promise<string> {
  let m: any = {}
  try {
    m = JSON.parse((await getConfig('suchuang_endpoints')) || '{}')
  } catch {
    /* ignore */
  }
  return typeof m?.[model] === 'string' ? m[model] : ''
}

async function highwayEndpoint(model: string): Promise<string> {
  let m: any = {}
  try {
    m = JSON.parse((await getConfig('highway_endpoints')) || '{}')
  } catch {
    /* ignore */
  }
  return typeof m?.[model] === 'string' ? m[model] : ''
}

// "1024x1536" → 取最接近我方 9 个画幅之一的宽高比 key（与前端 RATIOS 同一套词表）。
function sizeToRatio(size?: string): string {
  const m = /^(\d+)x(\d+)$/.exec(size || '')
  if (!m) return '1:1'
  const r = Number(m[1]) / Number(m[2])
  const cands: [number, string][] = [
    [1, '1:1'], [4 / 5, '4:5'], [3 / 4, '3:4'], [2 / 3, '2:3'], [9 / 16, '9:16'],
    [5 / 4, '5:4'], [4 / 3, '4:3'], [3 / 2, '3:2'], [16 / 9, '16:9']
  ]
  let best = '1:1'
  let bd = Infinity
  for (const [rv, rs] of cands) {
    const d = Math.abs(rv - r)
    if (d < bd) {
      bd = d
      best = rs
    }
  }
  return best
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const onAbort = (): void => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort)
  })
}

/** 速创API（异步：提交 /api/async/<接口> → 轮询 /api/async/detail，status 2=成功，图片在 data.result[]）。 */
async function suchuangGen(relay: RelayCfg, x: GenInput, ext?: AbortSignal): Promise<GenResult> {
  try {
    const ep = await suchuangEndpoint(x.model)
    if (!ep) return { ok: false, images: [], error: `速创未配置模型「${x.model}」的接口` }
    if (x.initImages && x.initImages.length) {
      // 速创参考图需公网 URL，本系统只有 data:URL → 暂不支持改图，交给其他站或纯文字生图
      return { ok: false, images: [], error: '速创暂不支持参考图改图' }
    }
    const auth = { Authorization: relay.key, 'Content-Type': 'application/json' }
    const url = `${relay.base}/api/async/${ep}?key=${encodeURIComponent(relay.key)}`
    const body = JSON.stringify({ prompt: x.prompt, size: sizeToRatio(x.size) })
    const subRes = await withTimeout(20_000, (s) => fetch(url, { method: 'POST', headers: auth, body, signal: s }), ext)
    const subJson: any = await subRes.json().catch(() => ({}))
    const id: string = subJson?.data?.id || ''
    if (!id) return { ok: false, images: [], error: `速创提交失败：${subJson?.msg || subRes.status}` }
    const detUrl = `${relay.base}/api/async/detail?key=${encodeURIComponent(relay.key)}&id=${encodeURIComponent(id)}`
    // 轮询到成功/失败；外部信号（本站超时或用户中止）会打断 sleep/fetch 而退出
    for (;;) {
      await sleep(3000, ext)
      const det = await fetch(detUrl, { headers: { Authorization: relay.key }, signal: ext }).catch(() => null)
      if (!det) continue
      const dj: any = await det.json().catch(() => ({}))
      const st = dj?.data?.status
      if (st === 2) {
        const urls: any[] = Array.isArray(dj?.data?.result) ? dj.data.result : []
        const images: string[] = []
        for (const u of urls) {
          try {
            images.push(typeof u === 'string' && u.startsWith('data:') ? u : await urlToDataUrl(String(u)))
          } catch {
            /* skip */
          }
        }
        return images.length ? { ok: true, images } : { ok: false, images: [], error: '速创返回无可用图片' }
      }
      if (st === 3) return { ok: false, images: [], error: `速创生图失败：${dj?.data?.message || ''}` }
      // 0/1=处理中：继续轮询
    }
  } catch (e: any) {
    const aborted = e?.name === 'AbortError'
    return {
      ok: false,
      images: [],
      aborted,
      error: aborted ? (ext?.aborted ? '已中止生成' : '生图超时') : `速创出错：${e?.message ?? e}`
    }
  }
}

/** 接口AI(highway) 同步自定义接口：POST {base}/v3/{接口}，返回 {images:[url]}。仅文生图。 */
async function highwayGen(relay: RelayCfg, x: GenInput, ext?: AbortSignal): Promise<GenResult> {
  try {
    const ep = await highwayEndpoint(x.model)
    if (!ep) return { ok: false, images: [], error: `接口AI未配置模型「${x.model}」的接口` }
    if (x.initImages && x.initImages.length) return { ok: false, images: [], error: '接口AI仅支持文字生图' }
    const res = await withTimeout(
      82_000,
      (s) =>
        fetch(`${relay.base}/v3/${ep}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${relay.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: x.prompt, size: x.size || '1024x1024', background: 'auto', moderation: 'auto' }),
          signal: s
        }),
      ext
    )
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, images: [], error: `接口AI ${res.status}：${t.slice(0, 200)}` }
    }
    const j: any = await res.json().catch(() => ({}))
    const urls: any[] = Array.isArray(j?.images)
      ? j.images
      : Array.isArray(j?.data)
        ? j.data.map((d: any) => d?.url || d)
        : []
    const images: string[] = []
    for (const u of urls) {
      try {
        images.push(typeof u === 'string' && u.startsWith('data:') ? u : await urlToDataUrl(String(u)))
      } catch {
        /* skip */
      }
    }
    return images.length ? { ok: true, images } : { ok: false, images: [], error: '接口AI返回无可用图片' }
  } catch (e: any) {
    const aborted = e?.name === 'AbortError'
    return { ok: false, images: [], aborted, error: aborted ? (ext?.aborted ? '已中止生成' : '生图超时') : `接口AI出错：${e?.message ?? e}` }
  }
}

/** 标准 OpenAI 格式中转站（青云/云雾）：按 flow / chat_image_models 选 images 或 chat 接口。
 *  relay.suffix 追加到发给该站的模型名（如云雾 :floor 走最便宜路由）；模型路由判断仍用原始模型名。 */
async function openaiGen(relay: RelayCfg, x: GenInput, ext?: AbortSignal): Promise<GenResult> {
  const { base, key } = relay
  // 后缀(如云雾 :floor 最便宜路由)只用于纯文生图；带参考图/改图(/v1/images/edits)不加后缀——实测加了会卡死超时。
  const isEdit = !!(x.initImages && x.initImages.length)
  const sm = x.model + (isEdit ? '' : relay.suffix || '')
  const flow = (await getConfig('relay_flow')) || 'auto'
  // 强制走对话接口的生图模型（gpt-image-2 / nano-banana 等在标准站只认 /v1/chat），优先级最高。
  const chatModels = ((await getConfig('chat_image_models')) || '').split(',').map((s) => s.trim()).filter(Boolean)
  const isChatModel = chatModels.some((m) => x.model === m || x.model.startsWith(m))
  try {
    // 参考图/改图(局部重绘)必须走 /v1/images/edits，优先级最高——即使该模型平时走对话接口，
    // 对话接口不支持 image edits（会报 "gpt-image models are not supported for chat completions"）。
    if (isEdit) return await viaImages(base, key, sm, x, ext)
    if (isChatModel) return await viaChat(base, key, sm, x, ext)
    if (flow === 'chat') return await viaChat(base, key, sm, x, ext)
    if (flow === 'images') return await viaImages(base, key, sm, x, ext)
    const stdImage = /gpt-image|dall-?e|flux|stable|sd[-\d]|seedream|qwen-image|wan[\d.]*-?image|grok.*image|z-image|imagen|midjourney|mj/i.test(
      x.model
    )
    const looksChat = /4o.*image|image.*4o|gpt-4o|gemini.*image|chat/i.test(x.model)
    if (stdImage) return await viaImages(base, key, sm, x, ext) // 单流，不回退
    if (looksChat) {
      const r1 = await viaChat(base, key, sm, x, ext)
      if (r1.ok) return r1
      const r2 = await viaImages(base, key, sm, x, ext)
      return r2.ok ? r2 : r1
    }
    const r1 = await viaImages(base, key, sm, x, ext)
    if (r1.ok) return r1
    const r2 = await viaChat(base, key, sm, x, ext)
    return r2.ok ? r2 : r1
  } catch (e: any) {
    const aborted = e?.name === 'AbortError'
    return { ok: false, images: [], aborted, error: aborted ? (ext?.aborted ? '已中止生成' : '生图超时') : `生图出错：${e?.message ?? e}` }
  }
}

export interface RelayStat {
  id: string
  total: number
  ok: number
  rate: number
  avgMs: number
}
/** 近 24h 各站成功率 + 平均耗时（按 GenLog.relayId 聚合），用于自动排序与跳过死站。 */
export async function relayStats(): Promise<Record<string, RelayStat>> {
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  let rows: { relayId: string | null; ok: boolean; ms: number | null }[] = []
  try {
    rows = await prisma.genLog.findMany({
      where: { createdAt: { gte: since }, NOT: { relayId: null } },
      select: { relayId: true, ok: true, ms: true },
      orderBy: { createdAt: 'desc' },
      take: 3000
    })
  } catch {
    /* ignore */
  }
  const acc: Record<string, { total: number; ok: number; ms: number; msn: number }> = {}
  for (const r of rows) {
    const id = r.relayId || ''
    if (!id) continue
    const a = (acc[id] ||= { total: 0, ok: 0, ms: 0, msn: 0 })
    a.total++
    if (r.ok) a.ok++
    if (typeof r.ms === 'number') {
      a.ms += r.ms
      a.msn++
    }
  }
  const out: Record<string, RelayStat> = {}
  for (const [id, a] of Object.entries(acc)) {
    out[id] = { id, total: a.total, ok: a.ok, rate: a.total ? a.ok / a.total : 1, avgMs: a.msn ? Math.round(a.ms / a.msn) : 0 }
  }
  return out
}

/** 按文档「最便宜→最快→成功率最高」自动排失败切换链；自动剔除最近成功率过低的死站。manual 模式保持配置顺序。 */
async function orderRelays(relays: RelayCfg[]): Promise<RelayCfg[]> {
  if (relays.length <= 1) return relays
  if (((await getConfig('relay_order_mode')) || 'auto') === 'manual') return relays
  const stats = await relayStats()
  const minRate = Number(await getConfig('relay_health_min')) || 0.25
  // 跳死站：样本≥5 且成功率<阈值。全被跳光则退回原列表，避免无站可用。
  const healthy = relays.filter((r) => {
    const s = stats[r.id]
    return !s || s.total < 5 || s.rate >= minRate
  })
  const pool = healthy.length ? healthy : relays
  const ms = (r: RelayCfg): number => stats[r.id]?.avgMs || 999_999
  const rate = (r: RelayCfg): number => (stats[r.id] && stats[r.id].total >= 3 ? stats[r.id].rate : 0.5)
  const cheapest = [...pool].sort((a, b) => a.price - b.price)[0]
  const fastest = [...pool].sort((a, b) => ms(a) - ms(b))[0]
  const reliable = [...pool].sort((a, b) => rate(b) - rate(a))[0]
  const chain: RelayCfg[] = []
  for (const r of [cheapest, fastest, reliable, ...pool]) {
    if (r && !chain.some((c) => c.id === r.id)) chain.push(r)
  }
  return chain
}

/** 多中转站代发生图：能力过滤(参考图/画幅) → 自动排序(便宜→快→稳、跳死站) → 依次尝试，出图即返回。
 *  ext：客户端"中止"信号——用户主动中止则不再换站；单站超时则自动切下一站。未出图即不扣费。 */
export async function generate(x: GenInput, ext?: AbortSignal): Promise<GenResult> {
  const all = await getModelRelays(x.model)
  if (!all.length) return { ok: false, images: [], error: '后台未配置中转站' }
  // 按任务需求过滤中转站：带参考图改图→只用支持参考图的站；特殊画幅→只用支持该画幅的站。
  const hasRef = !!(x.initImages && x.initImages.length)
  const ratio = sizeToRatio(x.size)
  const capable = all.filter((r) => {
    if (hasRef && !r.ref) return false // 带参考图/改图 → 只用支持参考图的站
    if (r.ratios.length && !r.ratios.includes(ratio)) return false // 特殊画幅 → 只用支持该画幅的站
    return true
  })
  if (!capable.length) {
    return {
      ok: false,
      images: [],
      error: hasRef ? '当前模型暂无支持参考图改图的中转站，请改用纯文字生成' : `当前模型暂无支持 ${ratio} 画幅的中转站，请换个比例`
    }
  }
  const relays = await orderRelays(capable) // 自动排序：便宜→快→稳，跳过死站
  // 单次生图可能要 50-60s。给首选站最多 ~62s 跑完整次生图；它若快速失败，用剩余预算再试下一个站。
  // 所有站合计不超过 ~92s，留在 Cloudflare ~100s 内。（不能简单 85/站数——会把慢生图的站全切断。）
  const TOTAL_BUDGET = 92_000
  const PER_CAP = 62_000
  const t0 = Date.now()
  let last: GenResult = { ok: false, images: [], error: '生图失败' }
  for (const relay of relays) {
    const remaining = TOTAL_BUDGET - (Date.now() - t0)
    if (remaining < 8_000) break // 时间不够再试下一个站，避免超 Cloudflare 上限
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), Math.min(PER_CAP, remaining))
    const onAbort = (): void => ac.abort()
    if (ext) {
      if (ext.aborted) ac.abort()
      else ext.addEventListener('abort', onAbort)
    }
    try {
      const r =
        relay.format === 'suchuang'
          ? await suchuangGen(relay, x, ac.signal)
          : relay.format === 'highway'
            ? await highwayGen(relay, x, ac.signal)
            : await openaiGen(relay, x, ac.signal)
      if (r.ok) {
        r.relayId = relay.id // 记录实际出图的站，落库供统计
        return r
      }
      last = r
      if (ext?.aborted) return { ...r, aborted: true } // 用户主动中止：不再换站
      // 否则（本站超时/报错）→ 继续尝试下一个站
    } finally {
      clearTimeout(timer)
      if (ext) ext.removeEventListener('abort', onAbort)
    }
  }
  // 全部站都失败：若是单站超时（aborted）而非用户主动中止，给个不误导的提示
  if (last.aborted && !ext?.aborted) {
    return { ok: false, images: [], error: '当前模型的中转站都繁忙/超时了，请稍后再试或换个模型' }
  }
  return last
}

// 对话模式：纯文本对话（创意沟通），用 chat_model（默认 claude-sonnet-4-6）。
export async function chatText(
  messages: { role: string; content: string }[]
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const base = normalizeBaseUrl(await getConfig('relay_base_url'))
  const key = await getConfig('relay_api_key')
  const model = (await getConfig('chat_model')) || 'claude-sonnet-4-6'
  if (!base || !key) return { ok: false, error: '后台未配置中转站' }
  try {
    const res = await withTimeout(60000, (signal) =>
      fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: authHeaders(key),
        body: JSON.stringify({ model, messages, stream: false }),
        signal
      })
    )
    if (!res.ok) return { ok: false, error: `对话失败 HTTP ${res.status}` }
    const j = await res.json()
    const reply = j?.choices?.[0]?.message?.content
    if (typeof reply !== 'string') return { ok: false, error: '对话返回异常' }
    return { ok: true, reply }
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? '对话超时' : `对话出错：${e?.message ?? e}` }
  }
}
