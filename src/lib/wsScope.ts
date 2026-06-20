import { getConfig } from './config'
import type { RawMessage } from './wsRelay'

// 翰文范围审核：只做文书/文员相关工作。命中越界关键词（写代码、中转站/密钥、与文书无关）即拒。
// 轻量、默认放行、小黑名单，避免误伤正常文书请求。词表来自后台 ws_scope_blocked_words。
export function latestUserText(messages: RawMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      return m.content.map((p: any) => (p?.type === 'text' ? p.text : '')).join(' ')
    }
  }
  return ''
}

/** 拼接所有 user 文本（不止最后一条），防把越界请求藏到前面的轮次里绕过 */
function allUserText(messages: RawMessage[]): string {
  const parts: string[] = []
  for (const m of messages) {
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') parts.push(m.content)
    else if (Array.isArray(m.content))
      parts.push(m.content.map((p: any) => (p?.type === 'text' ? p.text : '')).join(' '))
  }
  return parts.join('\n')
}

export async function checkScope(
  messages: RawMessage[]
): Promise<{ blocked: boolean; word?: string }> {
  const raw = (await getConfig('ws_scope_blocked_words')) || ''
  const words = raw
    .split(/[,，\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
  const text = allUserText(messages).toLowerCase()
  for (const w of words) {
    if (w && text.includes(w)) return { blocked: true, word: w }
  }
  return { blocked: false }
}
