import { getConfig } from './config'

// 提示词内容审核：命中后台配置的违规词即拦截（防用户借你的中转站 Key 生成违规内容→封号/法律风险）。
export async function checkPrompt(prompt: string): Promise<{ blocked: boolean; word?: string }> {
  const raw = (await getConfig('blocked_words')) || ''
  const words = raw
    .split(/[,，\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
  const p = (prompt || '').toLowerCase()
  for (const w of words) {
    if (w && p.includes(w)) return { blocked: true, word: w }
  }
  return { blocked: false }
}
