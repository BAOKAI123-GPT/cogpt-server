import { prisma } from './db'

// 后台可改配置；DB 有值用 DB，否则用默认（中转站密钥默认回退到环境变量）
export const CONFIG_DEFAULTS: Record<string, string> = {
  relay_base_url: process.env.RELAY_BASE_URL ?? '',
  relay_api_key: process.env.RELAY_API_KEY ?? '',
  relay_flow: 'auto', // auto | images | chat
  allowed_models: JSON.stringify(['gpt-image-1']),
  // 必须走对话接口(/v1/chat/completions)的生图模型——这些模型在中转站只认对话接口，
  // 走标准图像接口会一直卡住直到超时(踩过 gpt-image-2 的坑)。逗号分隔，后台可改。
  // 在此列表里的模型，无论 relay_flow 是什么都强制走对话接口，避免再次"全失败"。
  // 注意：gpt-image-2 在云雾(标准/v1)走的是 /v1/images/generations，不能放这里（放了会被强制走对话接口而失败）。
  // 这里只放在标准站确实只认对话接口的模型。
  chat_image_models: 'gemini-2.5-flash-image,gemini-3-pro-image,nano-banana,gpt-4o-image,grok-imagine-image,grok-imagine-image-pro',
  // —— 多中转站 ——
  // relays: 中转站列表。每项 {id,name,base,key,format}；format=openai(标准/v1) 或 suchuang(速创异步接口)。
  relays: '[]',
  // model_relays: 模型→中转站id优先级数组（顺序=优先用便宜的，失败自动切后面）。如 {"gpt-image-2":["qingyun","suchuang"]}
  model_relays: '{}',
  // suchuang_endpoints: 速创格式站，模型→异步接口名。如 {"gpt-image-2":"image_gpt","gemini-2.5-flash-image":"image_nanoBanana2"}
  suchuang_endpoints: '{"gpt-image-2":"image_gpt","gemini-2.5-flash-image":"image_nanoBanana2"}',
  // highway_endpoints: 接口AI(highway)格式站，模型→/v3 接口名。如 {"gpt-image-2-light":"gpt-image-2-light-text-to-image"}
  highway_endpoints: '{"gpt-image-2-light":"gpt-image-2-light-text-to-image"}',
  // 自动优先级：auto=按实测(便宜→快→稳)自动排序+跳死站；manual=保持 model_relays 配置顺序
  relay_order_mode: 'auto',
  relay_health_min: '0.25', // 近24h样本≥5且成功率<此值的站，自动跳过(死站)
  // —— 模型熔断/告警/自动恢复（站×模型粒度，内存计数+Config持久化禁用窗口，无需cron）——
  circuit_consec_fail: '5', // 1小时内同一(模型×中转站)连续失败N次 → 熔断
  circuit_30min_fail: '10', // 30分钟内同一(模型×中转站)累计失败N次 → 熔断
  circuit_disable_hours: '2', // 熔断后临时下架小时数，到点请求时惰性自动恢复
  relay_disabled: '{}', // 已熔断窗口 {"<model>|<relayId>": 到期毫秒}，过期自动失效（后台 RelayManager 可见）
  // 两档质量模式：模型→所属模式(standard|quality) 与 模型→扣点数
  model_mode: '{"gpt-image-2-light":"standard","gpt-image-2":"quality","gemini-2.5-flash-image":"quality"}',
  // —— 点数制（方案B）：1 旧额度 = 10 点。标准10 / 高质量GPT20 / Gemini30(=1.5×GPT，成本最高故最贵) ——
  model_credits: '{"gpt-image-2-light":10,"gpt-image-2":20,"gemini-2.5-flash-image":30}',
  // 多参考图加价：每多 1 张参考图(>1)额外加点（多图上传慢、易超时、占上游更多）。
  ref_extra_points: '5',
  // 高清加价：按本地放大目标长边阈值加点（高清=本地放大，对我方零API成本，属产品/利润杠杆，可调 0 关闭）。
  // 客户端在生图请求里带 hdEdge(目标长边像素)；服务端取 hdEdge≥阈值中的最大点数。
  hd_surcharge: '{"2048":5,"4096":10}',
  free_daily: '20', // 每日免费点数（=2 次标准）
  invite_referrer_bonus: '100', // 拉人成功，邀请人得点数（=10 次×10）
  invite_referee_bonus: '100', // 被拉新用户得点数（=10 次×10）
  invite_recharge_rebate_pct: '10', // ②充值返额：被邀请人(仅CoGPT)每次充值，邀请人额外得 充值点数的此百分比（赠送点数）
  chat_model: 'claude-sonnet-4-6', // 对话模式用的文本模型（创意沟通）
  // —— 风控/成本护栏 ——
  daily_gen_cap: '0', // 全站每日成功生图上限(0=不限)，防中转站成本失控
  blocked_words: '习近平,法轮功,六四,台独,港独,裸体,色情,做爱,性交,自杀教程,炸弹制作,枪支制作', // 提示词违规词(逗号分隔)，命中即拦截
  sms_ip_hourly_cap: '20', // 单 IP 每小时最多发码数
  sms_daily_cap: '500', // 全站每日发码上限，防短信余额被刷光
  sms_enabled: '1',
  sms_sign_name: '速通互联验证码',
  sms_template_code: '100001',
  // —— 官网下载（后台可改：换镜像/换版本无需改代码）——
  app_version: '0.1.0', // 最新客户端版本号（低于此版本的客户端会被提示更新）
  update_notes: '', // 更新说明（更新弹窗显示）
  force_update: '0', // 1=强制更新（旧版不可继续使用）
  download_win_url: '', // Windows 安装包下载直链（GitHub Release 国内镜像）
  download_mac_url: '', // macOS 安装包（Apple 芯片 arm64）下载直链
  download_mac_intel_url: '', // macOS 安装包（Intel x64）下载直链
  download_android_url: '', // 安卓 APK 下载直链
  download_mirror_note: '国内镜像高速下载', // 下载区文案
  // 套餐配额为点数（方案B：原次数×10）。价格不变。
  name_trial: '体验版',
  price_trial_cents: '990', // ¥9.9 试用
  quota_trial: '500', // 50 次×10
  name_basic: '基础版',
  price_basic_cents: '2990', // ¥29.9
  quota_basic: '2000', // 200 次×10
  name_plus: '升级版',
  price_plus_cents: '5900', // ¥59
  quota_plus: '5000', // 500 次×10
  name_ultra: '至尊版',
  price_ultra_cents: '12900', // ¥129
  quota_ultra: '15000', // 1500 次×10

  // ===== 翰文（文书）产品：独立配置，不影响 CoGPT =====
  ws_relay_base_url: process.env.WS_RELAY_BASE_URL ?? 'https://api.qingyuntop.top',
  ws_relay_api_key: process.env.WS_RELAY_API_KEY ?? '', // 中转站密钥（服务端持有，客户端不下发）
  ws_chat_model: 'claude-sonnet-4-6',
  ws_vision_model: 'claude-sonnet-4-6',
  ws_daily_token_cap: '0', // 全站每日 token 上限(0=不限)，成本护栏
  // 文员范围审核：命中即拒（与文书无关/越权）。逗号分隔，后台可改。
  // 高精度越界词（避免误伤“物料代码”等正常文书用词，故不含裸“代码/脚本/编程”）
  ws_scope_blocked_words:
    '中转站,api key,apikey,api密钥,模型密钥,access key,写代码,写一段代码,写段代码,帮我写代码,帮我编程,python,javascript,java代码,c++,golang,写爬虫,爬虫程序,正则表达式,sql语句,破解软件,外挂程序,黑客,抓包工具',
  // 翰文版本/下载（后台可改）
  ws_app_version: '0.4.0',
  ws_update_notes: '',
  ws_force_update: '0',
  ws_download_win_url: '',
  ws_download_mac_url: '',
  ws_download_mac_intel_url: '',
  ws_download_android_url: '',
  ws_download_mirror_note: '国内镜像高速下载',
  // 翰文三档套餐：按月订阅(¥)，token 额度每周刷新(不结转)
  ws_name_basic: '基础版',
  ws_price_basic_cents: '88800', // ¥888/月
  ws_week_tokens_basic: '2000000', // 周额度 200 万 token
  ws_name_plus: '升级版',
  ws_price_plus_cents: '188800', // ¥1888/月
  ws_week_tokens_plus: '5000000',
  ws_name_ultra: '至尊版',
  ws_price_ultra_cents: '388800', // ¥3888/月
  ws_week_tokens_ultra: '12000000'
}

export async function getConfig(key: string): Promise<string> {
  const row = await prisma.config.findUnique({ where: { key } })
  if (row) return row.value
  return CONFIG_DEFAULTS[key] ?? ''
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({ where: { key }, create: { key, value }, update: { value } })
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await prisma.config.findMany()
  const out: Record<string, string> = { ...CONFIG_DEFAULTS }
  for (const r of rows) out[r.key] = r.value
  return out
}

export interface TierInfo {
  id: 'trial' | 'basic' | 'plus' | 'ultra'
  name: string
  priceCents: number
  quota: number
}

export async function getTiers(): Promise<TierInfo[]> {
  const c = await getAllConfig()
  return [
    { id: 'trial', name: c.name_trial, priceCents: Number(c.price_trial_cents), quota: Number(c.quota_trial) },
    { id: 'basic', name: c.name_basic, priceCents: Number(c.price_basic_cents), quota: Number(c.quota_basic) },
    { id: 'plus', name: c.name_plus, priceCents: Number(c.price_plus_cents), quota: Number(c.quota_plus) },
    { id: 'ultra', name: c.name_ultra, priceCents: Number(c.price_ultra_cents), quota: Number(c.quota_ultra) }
  ]
}

// ——— 翰文（文书）套餐：周 token 额度 ———
export interface WsTierInfo {
  id: 'basic' | 'plus' | 'ultra'
  name: string
  priceCents: number
  weekTokens: number
}

export async function getWsTiers(): Promise<WsTierInfo[]> {
  const c = await getAllConfig()
  return [
    { id: 'basic', name: c.ws_name_basic, priceCents: Number(c.ws_price_basic_cents), weekTokens: Number(c.ws_week_tokens_basic) },
    { id: 'plus', name: c.ws_name_plus, priceCents: Number(c.ws_price_plus_cents), weekTokens: Number(c.ws_week_tokens_plus) },
    { id: 'ultra', name: c.ws_name_ultra, priceCents: Number(c.ws_price_ultra_cents), weekTokens: Number(c.ws_week_tokens_ultra) }
  ]
}
