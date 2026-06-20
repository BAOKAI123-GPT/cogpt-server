import { getConfig } from './config'

// 翰文：服务端代发对话（带工具调用），中转站密钥只在服务端。等价于翰文客户端原 chatRaw。
function normalizeBaseUrl(raw: string): string {
  let u = (raw || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  return u.replace(/\/+$/, '').replace(/\/v1$/i, '')
}

export interface RawMessage {
  role: string
  content?: unknown
  tool_calls?: unknown[]
  tool_call_id?: string
  name?: string
}

export interface AgentChatResult {
  ok: boolean
  message?: RawMessage
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  status?: number
  error?: string
}

export async function agentChat(args: {
  messages: RawMessage[]
  tools?: unknown[]
  model: string
}): Promise<AgentChatResult> {
  const baseUrl = normalizeBaseUrl(await getConfig('ws_relay_base_url'))
  const apiKey = await getConfig('ws_relay_api_key')
  if (!baseUrl || !apiKey) return { ok: false, error: '后端未配置翰文中转站(ws_relay_*)' }

  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    stream: false,
    max_tokens: 4096
  }
  if (args.tools && args.tools.length) {
    body.tools = args.tools
    body.tool_choice = 'auto'
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 180000)
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: `中转站 ${res.status}：${t.slice(0, 300)}` }
    }
    const json: any = await res.json()
    const message = json?.choices?.[0]?.message
    if (!message) return { ok: false, error: '中转站返回为空' }
    return { ok: true, message, usage: json?.usage }
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? '请求超时' : `请求出错：${e?.message ?? e}` }
  } finally {
    clearTimeout(timer)
  }
}

/** 估算 token（中转站未返回 usage 时兜底）：约 4 字符/token */
export function estimateTokens(messages: RawMessage[], reply?: RawMessage): number {
  const text = (m: RawMessage): string => {
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content))
      return m.content.map((p: any) => (p?.type === 'text' ? p.text : '[img]')).join('')
    return ''
  }
  let chars = messages.reduce((s, m) => s + text(m).length, 0)
  if (reply) chars += text(reply).length
  return Math.max(1, Math.ceil(chars / 4))
}
