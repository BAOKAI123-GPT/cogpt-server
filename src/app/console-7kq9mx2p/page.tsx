'use client'
import { useEffect, useState } from 'react'

const box: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 12,
  padding: 16
}
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(0,0,0,.3)',
  color: '#e9e8f0',
  boxSizing: 'border-box'
}
const btn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(120deg,#7b5cff,#b06cff)',
  color: '#fff',
  cursor: 'pointer'
}
const btnGhost: React.CSSProperties = {
  ...btn,
  background: 'rgba(255,255,255,.08)'
}

async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include'
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data: j }
}

export default function Console() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    api('/api/admin/me').then((r) => setAuthed(r.ok))
  }, [])

  if (authed === null) return <Center>加载中…</Center>
  if (!authed) return <Login onOk={() => setAuthed(true)} />
  return <Dashboard onLogout={() => setAuthed(false)} />
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>{children}</div>
}

function Login({ onOk }: { onOk: () => void }) {
  const [username, setU] = useState('admin')
  const [password, setP] = useState('')
  const [token, setT] = useState('')
  const [err, setErr] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState('')

  async function login() {
    setErr('')
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password, token }) })
    if (r.ok) onOk()
    else setErr(r.data.error || '登录失败')
  }
  async function enroll() {
    setErr('')
    const r = await api('/api/admin/enroll', { method: 'POST', body: JSON.stringify({ username, password }) })
    if (r.ok) {
      setQr(r.data.qr)
      setSecret(r.data.secret)
    } else setErr(r.data.error || '请先填对账号密码')
  }

  return (
    <Center>
      <div style={{ ...box, width: 360 }}>
        <h2 style={{ marginTop: 0 }}>Co-GPT 管理后台</h2>
        <label style={{ fontSize: 12, opacity: 0.7 }}>账号</label>
        <input style={input} value={username} onChange={(e) => setU(e.target.value)} />
        <div style={{ height: 8 }} />
        <label style={{ fontSize: 12, opacity: 0.7 }}>密码</label>
        <input style={input} type="password" value={password} onChange={(e) => setP(e.target.value)} />
        <div style={{ height: 8 }} />
        <label style={{ fontSize: 12, opacity: 0.7 }}>两步验证码（认证器 6 位）</label>
        <input style={input} value={token} onChange={(e) => setT(e.target.value)} placeholder="123456" />
        {err && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={btn} onClick={login}>
            登录
          </button>
          <button style={btnGhost} onClick={enroll}>
            首次绑定 2FA
          </button>
        </div>
        {qr && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <p style={{ fontSize: 12, opacity: 0.8 }}>用认证器(如 Google Authenticator)扫码绑定：</p>
            <img src={qr} width={180} height={180} alt="2FA" />
            <p style={{ fontSize: 11, opacity: 0.6, wordBreak: 'break-all' }}>密钥：{secret}</p>
          </div>
        )}
      </div>
    </Center>
  )
}

const CONFIG_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: 'relay_base_url', label: '中转站地址 (Base URL)' },
  { key: 'relay_api_key', label: '中转站 API Key', type: 'password' },
  { key: 'relay_flow', label: '接口流 (auto / images / chat)' },
  { key: 'allowed_models', label: '可用生图模型（JSON数组，如 ["gpt-image-2","gemini-2.5-flash-image"]，列表第1个为默认）' },
  { key: 'chat_image_models', label: '走对话接口的生图模型（逗号分隔；image-2/nano-banana 等必须填这里，否则生图卡死全失败）' },
  { key: 'free_daily', label: '每日免费次数' },
  { key: 'daily_gen_cap', label: '全站每日生图上限（0=不限，防成本失控）' },
  { key: 'blocked_words', label: '违规词拦截（逗号分隔）' },
  { key: 'sms_ip_hourly_cap', label: '单 IP 每小时短信上限' },
  { key: 'sms_daily_cap', label: '全站每日短信上限' },
  { key: 'sms_enabled', label: '短信开关 (1 开 / 0 关，生产请保持 1)' },
  { key: 'app_version', label: '最新版本号（低于此版本提示更新，如 0.2.0）' },
  { key: 'update_notes', label: '更新说明（更新弹窗显示）' },
  { key: 'force_update', label: '强制更新 (1 强制 / 0 可稍后)' },
  { key: 'download_win_url', label: 'Windows 下载直链（镜像）' },
  { key: 'download_mac_url', label: 'macOS Apple芯片 下载直链（镜像）' },
  { key: 'download_mac_intel_url', label: 'macOS Intel 下载直链（镜像）' },
  { key: 'download_android_url', label: '安卓 APK 下载直链（镜像）' }
]
// 翰文（文书）独立配置
const WS_CONFIG_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: 'ws_relay_base_url', label: '翰文·中转站地址' },
  { key: 'ws_relay_api_key', label: '翰文·中转站 API Key', type: 'password' },
  { key: 'ws_chat_model', label: '翰文·对话模型' },
  { key: 'ws_vision_model', label: '翰文·识图模型' },
  { key: 'ws_daily_token_cap', label: '翰文·全站每日 token 上限（0=不限）' },
  { key: 'ws_scope_blocked_words', label: '翰文·越界拦截词（逗号分隔）' },
  { key: 'ws_app_version', label: '翰文·最新版本号' },
  { key: 'ws_update_notes', label: '翰文·更新说明' },
  { key: 'ws_force_update', label: '翰文·强制更新 (1/0)' },
  { key: 'ws_download_win_url', label: '翰文·Windows 下载直链' },
  { key: 'ws_download_mac_url', label: '翰文·macOS(Apple) 下载直链' },
  { key: 'ws_download_mac_intel_url', label: '翰文·macOS(Intel) 下载直链' },
  { key: 'ws_download_android_url', label: '翰文·安卓 APK 下载直链' }
]
const TIER_FIELDS: { id: string; label: string }[] = [
  { id: 'basic', label: '基础版' },
  { id: 'plus', label: '升级版' },
  { id: 'ultra', label: '至尊版' }
]
// 生图(CoGPT)套餐含「体验版」试用档；翰文不含，故单列
const COGPT_TIER_FIELDS: { id: string; label: string }[] = [{ id: 'trial', label: '体验版' }, ...TIER_FIELDS]

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'config' | 'users' | 'orders' | 'logs'>('config')
  const tabName = (t: string): string =>
    t === 'config' ? '配置' : t === 'users' ? '用户' : t === 'orders' ? '订单' : '生图日志'
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ flex: 1 }}>Co-GPT 管理后台</h1>
        {(['config', 'users', 'orders', 'logs'] as const).map((t) => (
          <button key={t} style={tab === t ? btn : btnGhost} onClick={() => setTab(t)}>
            {tabName(t)}
          </button>
        ))}
        <button
          style={btnGhost}
          onClick={async () => {
            await api('/api/admin/me', { method: 'DELETE' })
            onLogout()
          }}
        >
          退出
        </button>
      </div>
      {tab === 'config' && <ConfigTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  )
}

function LogsTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [stats, setStats] = useState<{ total?: number; failCount?: number }>({})
  const [only, setOnly] = useState('')
  const [q, setQ] = useState('')
  async function load() {
    const r = await api(`/api/admin/logs?only=${only}&q=${encodeURIComponent(q)}`)
    if (r.ok) {
      setLogs(r.data.logs)
      setStats(r.data.stats)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [only])
  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ opacity: 0.8, fontSize: 13 }}>
          总生图：{stats.total ?? '-'} ・ 失败：{stats.failCount ?? '-'}
        </span>
        <select style={{ ...input, width: 'auto' }} value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">全部</option>
          <option value="fail">只看失败</option>
          <option value="ok">只看成功</option>
        </select>
        <input
          style={{ ...input, flex: 1, minWidth: 140 }}
          placeholder="按手机号筛选"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button style={btn} onClick={load}>
          刷新
        </button>
      </div>
      {logs.map((l) => (
        <div key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '8px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: l.ok ? '#46d39a' : '#ff6b6b' }}>{l.ok ? '✓ 成功' : '✗ 失败'}</span>
            <b>{l.phone}</b>
            <span style={{ opacity: 0.75 }}>{l.model}</span>
            <span style={{ opacity: 0.55 }}>{l.source}</span>
            {typeof l.ms === 'number' && <span style={{ opacity: 0.55 }}>{(l.ms / 1000).toFixed(1)}s</span>}
            <span style={{ opacity: 0.5, marginLeft: 'auto' }}>{new Date(l.createdAt).toLocaleString()}</span>
          </div>
          {!l.ok && l.error && (
            <div style={{ color: '#ffb4b4', fontSize: 12, marginTop: 4, wordBreak: 'break-all' }}>原因：{l.error}</div>
          )}
        </div>
      ))}
      {logs.length === 0 && <p style={{ opacity: 0.6 }}>暂无记录</p>}
    </div>
  )
}

// 多中转站 + 每模型选站（可视化）。relays / model_relays / suchuang_endpoints 都存进同一份 cfg。
function RelayManager({ cfg, set }: { cfg: Record<string, string>; set: (k: string, v: string) => void }) {
  const [stats, setStats] = useState<Record<string, { total: number; ok: number; rate: number; avgMs: number }>>({})
  const [bal, setBal] = useState<{ updatedAt: number; balances: any[] }>({ updatedAt: 0, balances: [] })
  const loadBal = (force = false): void => {
    api('/api/admin/relay-balances' + (force ? '?force=1' : '')).then((r) => r.ok && setBal({ updatedAt: r.data.updatedAt, balances: r.data.balances || [] }))
  }
  useEffect(() => {
    api('/api/admin/relay-stats').then((r) => r.ok && setStats(r.data.stats || {}))
    loadBal()
  }, [])
  const parseJson = (s: string | undefined, d: any): any => {
    try {
      const v = JSON.parse(s || '')
      return v ?? d
    } catch {
      return d
    }
  }
  const relays: any[] = (() => {
    const v = parseJson(cfg.relays, [])
    return Array.isArray(v) ? v : []
  })()
  const modelRelays: Record<string, string[]> = parseJson(cfg.model_relays, {})
  const models: string[] = (() => {
    const v = parseJson(cfg.allowed_models, [])
    return Array.isArray(v) ? v : []
  })()

  const saveRelays = (next: any[]): void => set('relays', JSON.stringify(next))
  const updRelay = (i: number, patch: any): void => saveRelays(relays.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRelay = (): void =>
    saveRelays([...relays, { id: 'relay' + (relays.length + 1), name: '新中转站', base: '', key: '', format: 'openai' }])
  const delRelay = (i: number): void => {
    const id = relays[i]?.id
    saveRelays(relays.filter((_, j) => j !== i))
    const mr: Record<string, string[]> = {}
    for (const k of Object.keys(modelRelays)) mr[k] = (modelRelays[k] || []).filter((x) => x !== id)
    set('model_relays', JSON.stringify(mr))
  }
  const toggle = (model: string, relayId: string): void => {
    const cur = new Set(modelRelays[model] || [])
    if (cur.has(relayId)) cur.delete(relayId)
    else cur.add(relayId)
    const ordered = relays.map((r) => r.id).filter((id) => cur.has(id)) // 顺序=中转站列表顺序（前=优先/便宜）
    set('model_relays', JSON.stringify({ ...modelRelays, [model]: ordered }))
  }
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid ' + (on ? '#6a8cff' : 'rgba(255,255,255,.18)'),
    background: on ? 'rgba(106,140,255,.18)' : 'transparent',
    color: on ? '#cdd9ff' : 'rgba(255,255,255,.6)',
    cursor: 'pointer',
    fontSize: 12
  })

  return (
    <div style={{ border: '1px solid rgba(106,140,255,.35)', borderRadius: 10, padding: 14, margin: '10px 0 16px' }}>
      <h3 style={{ marginTop: 0, color: '#9db4ff' }}>🔀 多中转站管理</h3>
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: -6 }}>
        中转站列表顺序 = 优先级（把便宜的放前面，前一个失败会自动切下一个）。下面给每个模型勾选可用的中转站。
      </p>
      {/* 各中转站余额（1小时缓存） */}
      <div style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <b style={{ color: '#9db4ff' }}>💰 中转站余额</b>
          <span style={{ opacity: 0.5 }}>{bal.updatedAt ? '更新于 ' + new Date(bal.updatedAt).toLocaleString() : '加载中…'}</span>
          <button style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => loadBal(true)}>刷新</button>
        </div>
        {bal.balances.length === 0 && <div style={{ opacity: 0.5 }}>暂无数据</div>}
        {bal.balances.map((b) => (
          <div key={b.id} style={{ display: 'flex', gap: 8, padding: '3px 0', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span style={{ flex: '0 0 90px' }}>{b.name || b.id}</span>
            <span style={{ flex: 1 }}>
              {b.available
                ? b.remainingUsd != null
                  ? `剩余 $${b.remainingUsd.toFixed(2)}${b.limitUsd != null ? ` / 总 $${b.limitUsd.toFixed(2)}` : ''}${b.usedUsd != null ? ` · 已用 $${b.usedUsd.toFixed(2)}` : ''}`
                  : b.usedUsd != null
                    ? `已用 $${b.usedUsd.toFixed(2)}（${b.note || '无总额度'}）`
                    : '—'
                : <span style={{ opacity: 0.55 }}>{b.note || '无余额接口'}</span>}
            </span>
          </div>
        ))}
      </div>
      {/* 当前熔断中的(模型×中转站)：自动下架、到点自动恢复，无需人工 */}
      {(() => {
        const dis: Record<string, number> = parseJson(cfg.relay_disabled, {})
        const now = Date.now()
        const active = Object.entries(dis).filter(([, v]) => typeof v === 'number' && v > now)
        return (
          <div style={{ border: '1px solid ' + (active.length ? 'rgba(255,170,90,.5)' : 'rgba(255,255,255,.14)'), borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
            <b style={{ color: active.length ? '#ffb15e' : '#9db4ff' }}>⛔ 熔断中（自动下架 · 到点自动恢复）</b>
            {active.length === 0 ? (
              <div style={{ opacity: 0.5, marginTop: 4 }}>当前无熔断，所有模型/中转站正常。</div>
            ) : (
              active.map(([k, until]) => {
                const [model, relayId] = k.split('|')
                const mins = Math.max(0, Math.round((until - now) / 60000))
                return (
                  <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                    <span style={{ flex: 1 }}>{model} @ {relayId}</span>
                    <span style={{ opacity: 0.7 }}>约 {mins} 分钟后恢复（{new Date(until).toLocaleString()}）</span>
                  </div>
                )
              })
            )}
          </div>
        )
      })()}
      {relays.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: '0 0 84px' }} placeholder="名称" value={r.name || ''} onChange={(e) => updRelay(i, { name: e.target.value })} />
          <input style={{ ...input, flex: '0 0 76px' }} placeholder="id" value={r.id || ''} onChange={(e) => updRelay(i, { id: e.target.value })} />
          <input style={{ ...input, flex: 2, minWidth: 140 }} placeholder="https://中转站地址" value={r.base || ''} onChange={(e) => updRelay(i, { base: e.target.value })} />
          <input
            style={{ ...input, flex: 1, minWidth: 100 }}
            placeholder="API Key"
            value={r.key || ''}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            onChange={(e) => updRelay(i, { key: e.target.value })}
          />
          <select style={{ ...input, flex: '0 0 100px' }} value={r.format || 'openai'} onChange={(e) => updRelay(i, { format: e.target.value })}>
            <option value="openai">标准 /v1</option>
            <option value="suchuang">速创异步</option>
            <option value="highway">接口AI同步</option>
          </select>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={r.ref ?? (r.format || 'openai') === 'openai'}
              onChange={(e) => updRelay(i, { ref: e.target.checked })}
            />
            参考图
          </label>
          <input
            style={{ ...input, flex: '0 0 120px' }}
            placeholder="限画幅(空=全部)"
            value={(r.ratios || []).join(',')}
            onChange={(e) => updRelay(i, { ratios: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
          <input
            style={{ ...input, flex: '0 0 64px' }}
            placeholder="后缀"
            value={r.suffix || ''}
            onChange={(e) => updRelay(i, { suffix: e.target.value })}
          />
          <input
            style={{ ...input, flex: '0 0 70px' }}
            placeholder="价¥/张"
            value={r.price ?? ''}
            onChange={(e) => updRelay(i, { price: Number(e.target.value) || 0 })}
          />
          {(() => {
            const s = stats[r.id]
            return s ? (
              <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap' }}>
                成{Math.round(s.rate * 100)}% · {(s.avgMs / 1000).toFixed(0)}s · {s.total}次
              </span>
            ) : (
              <span style={{ fontSize: 11, opacity: 0.4 }}>无近况</span>
            )
          })()}
          <button style={btnGhost} onClick={() => delRelay(i)}>
            删
          </button>
        </div>
      ))}
      <button style={btnGhost} onClick={addRelay}>
        + 添加中转站
      </button>

      <h4 style={{ margin: '14px 0 6px' }}>模型 → 可用中转站（点亮=启用，数字=优先顺序）</h4>
      {models.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>先在上方「可用生图模型」里填模型</p>}
      {models.map((m) => (
        <div key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, flex: '0 0 180px', opacity: 0.85, wordBreak: 'break-all' }}>{m}</span>
          {relays.length === 0 && <span style={{ fontSize: 12, opacity: 0.5 }}>先加中转站</span>}
          {relays.map((r) => {
            const idx = (modelRelays[m] || []).indexOf(r.id)
            return (
              <button key={r.id} style={chip(idx >= 0)} onClick={() => toggle(m, r.id)}>
                {idx >= 0 ? `${idx + 1}. ` : ''}
                {r.name || r.id}
              </button>
            )
          })}
        </div>
      ))}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>速创异步接口映射（模型→接口名，JSON）</label>
          <input style={input} value={cfg.suchuang_endpoints ?? ''} onChange={(e) => set('suchuang_endpoints', e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>接口AI(highway)接口映射（模型→/v3接口名，JSON）</label>
          <input style={input} value={cfg.highway_endpoints ?? ''} onChange={(e) => set('highway_endpoints', e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 200px' }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>中转站排序</label>
          <select style={input} value={cfg.relay_order_mode || 'auto'} onChange={(e) => set('relay_order_mode', e.target.value)}>
            <option value="auto">自动（便宜→快→稳，跳死站）</option>
            <option value="manual">手动（按上方矩阵顺序）</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>模型→模式（JSON：standard/quality）</label>
          <input style={input} value={cfg.model_mode ?? ''} onChange={(e) => set('model_mode', e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>模型→扣额度（JSON：标准1/高质量2）</label>
          <input style={input} value={cfg.model_credits ?? ''} onChange={(e) => set('model_credits', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function ConfigTab() {
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  useEffect(() => {
    api('/api/admin/config').then((r) => r.ok && setCfg(r.data.config))
  }, [])
  function set(k: string, v: string) {
    setCfg((c) => ({ ...c, [k]: v }))
  }
  async function save() {
    setMsg('保存中…')
    const r = await api('/api/admin/config', { method: 'POST', body: JSON.stringify({ config: cfg }) })
    setMsg(r.ok ? '已保存 ✓' : '保存失败')
    if (r.ok) setCfg(r.data.config)
  }
  return (
    <div style={box}>
      <h3 style={{ marginTop: 0 }}>中转站与基础配置</h3>
      {CONFIG_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>{f.label}</label>
          <input
            style={input}
            type={f.type || 'text'}
            // 关键：阻止浏览器/密码管理器把后台账号密码自动填进中转站地址和 Key
            name={`cfg_${f.key}`}
            autoComplete={f.type === 'password' ? 'new-password' : 'off'}
            data-lpignore="true"
            data-1p-ignore="true"
            value={cfg[f.key] ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
          />
        </div>
      ))}
      <RelayManager cfg={cfg} set={set} />
      <h3>套餐（价格单位：元）· 含体验版试用档</h3>
      {COGPT_TIER_FIELDS.map((t) => (
        <div key={t.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>{t.label} 名称</label>
            <input style={input} value={cfg[`name_${t.id}`] ?? ''} onChange={(e) => set(`name_${t.id}`, e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>价格(元)</label>
            <input
              style={input}
              value={cfg[`price_${t.id}_cents`] ? String(Number(cfg[`price_${t.id}_cents`]) / 100) : ''}
              onChange={(e) => set(`price_${t.id}_cents`, String(Math.round(Number(e.target.value) * 100)))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>月额度</label>
            <input style={input} value={cfg[`quota_${t.id}`] ?? ''} onChange={(e) => set(`quota_${t.id}`, e.target.value)} />
          </div>
        </div>
      ))}
      <h3 style={{ marginTop: 20, color: '#ff8a8a' }}>翰文（文书）配置</h3>
      {WS_CONFIG_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>{f.label}</label>
          <input
            style={input}
            type={f.type || 'text'}
            name={`cfg_${f.key}`}
            autoComplete={f.type === 'password' ? 'new-password' : 'off'}
            data-lpignore="true"
            data-1p-ignore="true"
            value={cfg[f.key] ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
          />
        </div>
      ))}
      <h3>翰文套餐（价格元；额度=每周 token，不结转）</h3>
      {TIER_FIELDS.map((t) => (
        <div key={`ws_${t.id}`} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>{t.label} 名称</label>
            <input style={input} value={cfg[`ws_name_${t.id}`] ?? ''} onChange={(e) => set(`ws_name_${t.id}`, e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>价格(元/月)</label>
            <input
              style={input}
              value={cfg[`ws_price_${t.id}_cents`] ? String(Number(cfg[`ws_price_${t.id}_cents`]) / 100) : ''}
              onChange={(e) => set(`ws_price_${t.id}_cents`, String(Math.round(Number(e.target.value) * 100)))}
            />
          </div>
          <div style={{ flex: 1.3 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>周 token 额度</label>
            <input style={input} value={cfg[`ws_week_tokens_${t.id}`] ?? ''} onChange={(e) => set(`ws_week_tokens_${t.id}`, e.target.value)} />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <button style={btn} onClick={save}>
          保存配置
        </button>
        <span style={{ marginLeft: 10, fontSize: 13, opacity: 0.8 }}>{msg}</span>
      </div>
    </div>
  )
}

function UsersTab() {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<any[]>([])
  async function load() {
    const r = await api('/api/admin/users?q=' + encodeURIComponent(q))
    if (r.ok) setUsers(r.data.users)
  }
  useEffect(() => {
    load()
  }, [])
  async function act(userId: string, action: string, extra: any = {}) {
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ userId, action, ...extra }) })
    load()
  }
  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={input} placeholder="按手机号搜索" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={btn} onClick={load}>
          搜索
        </button>
      </div>
      {users.map((u) => (
        <div key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '10px 0', fontSize: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>{u.phone}</b>
            <span style={{ opacity: 0.7 }}>
              生图:{u.memberTier}/{u.memberCredits}　翰文:{u.wsTier}/{u.wsWeekTokens}token {u.disabled ? '(已禁用)' : ''}
            </span>
            <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 'auto' }}>
              注册 {u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>生图:</span>
            <button style={btnGhost} onClick={() => act(u.id, 'addCredits', { value: 50 })}>+50次</button>
            <button style={btnGhost} onClick={() => act(u.id, 'addCredits', { value: -50 })}>-50次</button>
            <button style={btnGhost} onClick={() => act(u.id, 'setMember', { tier: 'basic' })}>开基础版(1月)</button>
            <button style={btnGhost} onClick={() => act(u.id, 'setMember', { tier: 'plus' })}>开升级版</button>
            <button style={btnGhost} onClick={() => act(u.id, 'setMember', { tier: 'ultra' })}>开至尊版</button>
            <button style={btnGhost} onClick={() => act(u.id, 'cancelMember')}>取消会员</button>
            <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>翰文:</span>
            <button style={btnGhost} onClick={() => act(u.id, 'setWsMember', { tier: 'basic' })}>开基础版(1月)</button>
            <button style={btnGhost} onClick={() => act(u.id, 'addWsTokens', { value: 1000000 })}>+100万token</button>
            <button style={btnGhost} onClick={() => act(u.id, 'cancelWsMember')}>取消翰文会员</button>
            <button style={btnGhost} onClick={() => act(u.id, 'disable', { value: !u.disabled })}>
              {u.disabled ? '解禁' : '封禁'}
            </button>
          </div>
        </div>
      ))}
      {users.length === 0 && <p style={{ opacity: 0.6 }}>暂无用户</p>}
    </div>
  )
}

function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  useEffect(() => {
    api('/api/admin/orders').then((r) => {
      if (r.ok) {
        setOrders(r.data.orders)
        setStats(r.data.stats)
      }
    })
  }, [])
  return (
    <div style={box}>
      <p>
        用户总数：{stats.userCount ?? '-'} ・ 已付订单：{stats.paidCount ?? '-'}
      </p>
      {orders.map((o) => (
        <div key={o.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '8px 0', fontSize: 13 }}>
          {o.outTradeNo} ・ {o.product === 'wenshu' ? '翰文' : '生图'} ・ {o.tier} ・ ¥{(o.amountCents / 100).toFixed(2)} ・ {o.status}
        </div>
      ))}
      {orders.length === 0 && <p style={{ opacity: 0.6 }}>暂无订单</p>}
    </div>
  )
}
