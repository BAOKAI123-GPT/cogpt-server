import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { quotaStatus, consumeHalf } from '@/lib/quota'
import { chatText } from '@/lib/relay'

// 创意沟通助手：帮用户把生图需求聊清楚；想好后给一句可直接生成的提示词并主动问是否生成。
const SYSTEM = `你是 Co-GPT 的「创意助手」。Co-GPT 是一个 AI 生图工具——用户描述想要的画面，由 AI 直接生成一张图片（不是网页、不是 HTML、绝不写代码）。
你的任务：用口语、简短地帮用户把"想画的这张图"聊清楚（主题、风格、主体元素、画面上的文字、配色、氛围等），缺关键信息就主动追问，一次别问太多。
当需求已经比较清楚时：
1. 先单独成行给出一句可直接用于生成图片的中文提示词，格式严格为：[[生图提示词]] 提示词内容
2. 紧接着用一句话问："要我现在帮你生成吗？回复『生成』就出图。"
你只负责把图聊清楚并给出提示词，真正出图由系统完成。不要提 HTML / 网页 / 代码，不要长篇大论。`

export async function POST(req: Request): Promise<Response> {
  const u = await currentUser(req)
  if (!u) return NextResponse.json({ error: '未登录', needLogin: true }, { status: 401 })
  const q = await quotaStatus(u)
  if (!q.canGenerate) {
    return NextResponse.json({ error: '额度已用完，请开通/升级或邀请好友得免费次数', needRecharge: true }, { status: 402 })
  }
  const body = await req.json().catch(() => ({}))
  const msgs: { role: string; content: string }[] = Array.isArray(body.messages) ? body.messages : []
  // 只保留最近若干轮，前置 system
  const recent = msgs
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
  if (recent.length === 0) return NextResponse.json({ error: '空请求' }, { status: 400 })
  const r = await chatText([{ role: 'system', content: SYSTEM }, ...recent])
  if (!r.ok) return NextResponse.json({ error: r.error || '对话失败' }, { status: 502 })
  await consumeHalf(u.id) // 扣 0.5 次
  const fresh = await currentUser(req)
  const after = fresh ? await quotaStatus(fresh) : q
  return NextResponse.json({ ok: true, reply: r.reply, quota: after })
}
