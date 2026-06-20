// 进程内幂等 + 单用户并发锁。
// 目的：客户端失败会自动重试（最多 3 次），且生图耗时可能逼近 Cloudflare 100s 超时，
// 存在「服务端已成功并扣费，但响应丢失 → 客户端重试」导致重复生成/重复扣费的风险。
// 这里用同一 reqId 去重：在途的重试共享同一次生成；已完成的成功结果短期缓存直接复用。
// 单实例 pm2 进程内存即可；重启丢失（窗口极小，可接受）。

export interface GenOut {
  status: number
  body: unknown
}

interface Flight {
  promise: Promise<GenOut>
  userId: string
}

const inflight = new Map<string, Flight>() // reqId -> 在途生成
const controllers = new Map<string, AbortController>() // reqId -> 中止控制器（供"中止生图"用）
const done = new Map<string, { out: GenOut; at: number }>() // reqId -> 已完成(仅缓存成功)
const userBusy = new Set<string>() // 正在生图的用户(防同一用户并发刷)
const RESULT_TTL = 10 * 60 * 1000

function gc(): void {
  const now = Date.now()
  for (const [k, v] of done) if (now - v.at > RESULT_TTL) done.delete(k)
}

export function getCached(reqId: string): GenOut | undefined {
  gc()
  return done.get(reqId)?.out
}
export function getInflight(reqId: string): Promise<GenOut> | undefined {
  return inflight.get(reqId)?.promise
}
export function userIsBusy(userId: string): boolean {
  return userBusy.has(userId)
}

/** 受幂等保护地执行一次生成；成功(200)结果会被缓存供重试复用。fn 收到中止信号，可在用户点"中止"时停止。 */
export async function runOnce(
  reqId: string,
  userId: string,
  fn: (signal: AbortSignal) => Promise<GenOut>
): Promise<GenOut> {
  const cached = getCached(reqId)
  if (cached) return cached
  const existing = inflight.get(reqId)
  if (existing) return existing.promise

  // 原子并发锁：同一用户已有在途请求（不同 reqId）直接拒绝，防并发刷额度/超花
  // （放在 cached/inflight 判断之后，确保同 reqId 重试仍能复用结果而不被拦）
  if (userBusy.has(userId)) {
    return { status: 429, body: { error: '上一条还在处理中，请稍候' } }
  }

  const ac = new AbortController()
  const promise = (async () => {
    try {
      const out = await fn(ac.signal)
      if (out && out.status === 200) done.set(reqId, { out, at: Date.now() })
      return out
    } finally {
      inflight.delete(reqId)
      userBusy.delete(userId)
      controllers.delete(reqId)
    }
  })()
  inflight.set(reqId, { promise, userId })
  controllers.set(reqId, ac)
  userBusy.add(userId)
  return promise
}

/** 中止某次在途生成（用户点"中止"）。中止后 generate 立即返回、释放并发锁，不会扣费。 */
export function cancel(reqId: string, userId?: string): boolean {
  const f = inflight.get(reqId)
  if (!f) return false
  if (userId && f.userId !== userId) return false // 只能取消自己的
  controllers.get(reqId)?.abort()
  return true
}
