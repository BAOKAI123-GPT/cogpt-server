import { getConfig } from './config'

// 各中转站余额查询（后台展示）。1 小时内存缓存，避免频繁打供应商被限流。
// 实测：openai 风格(云雾/青云) 有 /v1/dashboard/billing/{subscription,usage}；
//   青云 hard_limit 是真实额度→可算剩余；云雾 hard_limit 是占位大数→只显示已用量。
// 接口AI(highway)/速创(suchuang) 暂无可用余额 API（速创 /user/key 是 HTML 页），标注待渠道商提供。

export interface RelayBalance {
  id: string
  name: string
  format: string
  available: boolean
  limitUsd?: number
  usedUsd?: number
  remainingUsd?: number
  note?: string
}

interface RelayCfgLite {
  id: string
  name: string
  base: string
  key: string
  format: string
}

function normalizeBase(raw: string): string {
  return (raw || '').trim().replace(/\/+$/, '').replace(/\/v1(?:\/.*)?$/i, '').replace(/\/+$/, '')
}

async function readRelays(): Promise<RelayCfgLite[]> {
  try {
    const arr = JSON.parse((await getConfig('relays')) || '[]')
    if (!Array.isArray(arr)) return []
    return arr
      .filter((r) => r && r.base && r.key)
      .map((r) => ({
        id: String(r.id || r.name || r.base),
        name: String(r.name || r.id || ''),
        base: normalizeBase(String(r.base)),
        key: String(r.key),
        format: r.format === 'suchuang' || r.format === 'highway' ? r.format : 'openai'
      }))
  } catch {
    return []
  }
}

async function openaiBalance(r: RelayCfgLite): Promise<RelayBalance> {
  const h = { Authorization: `Bearer ${r.key}` }
  const out: RelayBalance = { id: r.id, name: r.name, format: r.format, available: false }
  try {
    const subRes = await fetch(`${r.base}/v1/dashboard/billing/subscription`, { headers: h, signal: AbortSignal.timeout(12000) })
    const sub: any = await subRes.json().catch(() => ({}))
    const limit = Number(sub?.hard_limit_usd)
    let used = NaN
    try {
      const useRes = await fetch(`${r.base}/v1/dashboard/billing/usage`, { headers: h, signal: AbortSignal.timeout(12000) })
      const u: any = await useRes.json().catch(() => ({}))
      used = Number(u?.total_usage) / 100 // total_usage 单位为美分
    } catch {
      /* usage 可选 */
    }
    if (Number.isFinite(limit)) {
      out.available = true
      if (limit > 1_000_000) {
        // 占位大数(如云雾)：无真实总额度，只能展示已用量
        out.usedUsd = Number.isFinite(used) ? used : undefined
        out.note = '该站未暴露真实余额，仅显示已用量'
      } else {
        out.limitUsd = limit
        if (Number.isFinite(used)) {
          out.usedUsd = used
          out.remainingUsd = Math.max(0, limit - used)
        } else {
          out.remainingUsd = limit
        }
      }
    } else {
      out.note = '余额接口返回异常'
    }
  } catch (e) {
    out.note = '余额查询失败：' + (e as Error).message.slice(0, 60)
  }
  return out
}

let cache: { at: number; data: RelayBalance[] } | null = null
const TTL = 3600_000 // 1 小时

export async function getRelayBalances(force = false): Promise<{ updatedAt: number; balances: RelayBalance[] }> {
  if (!force && cache && Date.now() - cache.at < TTL) return { updatedAt: cache.at, balances: cache.data }
  const relays = await readRelays()
  const balances: RelayBalance[] = []
  for (const r of relays) {
    if (r.format === 'openai') balances.push(await openaiBalance(r))
    else if (r.format === 'suchuang')
      balances.push({ id: r.id, name: r.name, format: r.format, available: false, note: '速创无统一余额，image/gemini 点数需渠道商提供 API（当前 /user/key 为 HTML 页）' })
    else
      balances.push({ id: r.id, name: r.name, format: r.format, available: false, note: '该站暂无可用余额查询 API，需渠道商提供' })
  }
  cache = { at: Date.now(), data: balances }
  return { updatedAt: cache.at, balances }
}
