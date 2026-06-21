import { getConfig, setConfig } from './config'

// 模型熔断器：按「模型 × 中转站」粒度。失败计数在内存(pm2 单进程常驻)，触发后把"禁用到期时间"
// 持久化进 Config(relay_disabled)，请求时惰性检查——过期自动恢复，无需 cron。重启后内存计数清零，
// 但已持久化的禁用窗口仍生效。失败→自动切其它可用渠道(generate 的失败切换链)，被熔断的(模型×站)
// 临时下架、到点自动上架。触发记 pm2 日志 + 后台 RelayManager 可视化(不发短信)。

type Ev = { t: number; ok: boolean }
const mem = new Map<string, Ev[]>() // key = `${model}|${relayId}`
const keyOf = (model: string, relayId: string): string => `${model}|${relayId}`
const HOUR = 3600_000
const HALF_HOUR = 1800_000

async function num(k: string, d: number): Promise<number> {
  const v = Number(await getConfig(k))
  return Number.isFinite(v) && v > 0 ? v : d
}

/** 记录一次(模型×站)的成败；失败达阈值则熔断。成功也记录(用于"连续失败"判定的中断)。 */
export async function recordOutcome(relayId: string, relayName: string, model: string, ok: boolean): Promise<void> {
  const k = keyOf(model, relayId)
  const now = Date.now()
  const arr = (mem.get(k) || []).filter((e) => now - e.t < HOUR)
  arr.push({ t: now, ok })
  mem.set(k, arr)
  if (ok) return

  const consecN = await num('circuit_consec_fail', 5)
  const win30N = await num('circuit_30min_fail', 10)
  let consec = 0
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!arr[i].ok) consec++
    else break
  }
  const fails30 = arr.filter((e) => now - e.t < HALF_HOUR && !e.ok).length
  if (consec >= consecN || fails30 >= win30N) {
    await trip(relayId, relayName, model, consec >= consecN ? `连续${consec}次失败` : `30分钟内${fails30}次失败`)
    mem.set(k, []) // 熔断后清零，避免恢复后立刻又因旧计数触发
  }
}

async function trip(relayId: string, relayName: string, model: string, reason: string): Promise<void> {
  const hours = await num('circuit_disable_hours', 2)
  const until = Date.now() + hours * HOUR
  let map: Record<string, number> = {}
  try {
    map = JSON.parse((await getConfig('relay_disabled')) || '{}')
  } catch {
    map = {}
  }
  // 已在禁用窗口内则不重复触发/重复发短信
  if (typeof map[keyOf(model, relayId)] === 'number' && map[keyOf(model, relayId)] > Date.now()) return
  map[keyOf(model, relayId)] = until
  await setConfig('relay_disabled', JSON.stringify(map))
  // 记 pm2 日志 + 持久化到 Config(后台 RelayManager 可见)；不发短信，靠自动切换+2h自动恢复。
  console.warn('[circuit] 熔断', { relayId, relayName, model, reason, until: new Date(until).toISOString() })
}

/** 取当前禁用映射(请求开始时读一次，过滤期间复用，避免每站一次DB读)。顺带清理过期项。 */
export async function disabledMap(): Promise<Record<string, number>> {
  let map: Record<string, number> = {}
  try {
    const parsed = JSON.parse((await getConfig('relay_disabled')) || '{}')
    // 防御：必须是普通对象，否则当空（避免 relay_disabled 被写成字符串/数组时整条生图链 500）
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    map = parsed
  } catch {
    return {}
  }
  const now = Date.now()
  let changed = false
  for (const [k, v] of Object.entries(map)) {
    if (typeof v !== 'number' || v <= now) {
      delete map[k]
      changed = true
    }
  }
  if (changed) await setConfig('relay_disabled', JSON.stringify(map)).catch(() => {})
  return map
}

export function isDisabled(map: Record<string, number>, relayId: string, model: string): boolean {
  const until = map[keyOf(model, relayId)]
  return typeof until === 'number' && until > Date.now()
}
