'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import s from './app.module.css'

const TOKEN_KEY = 'cogpt_token'
const RATIOS: { k: string; size: string; g: '方形' | '竖版' | '横版' }[] = [
  { k: '1:1', size: '1024x1024', g: '方形' },
  { k: '4:5', size: '1024x1280', g: '竖版' }, { k: '3:4', size: '1080x1440', g: '竖版' },
  { k: '2:3', size: '1024x1536', g: '竖版' }, { k: '9:16', size: '1080x1920', g: '竖版' },
  { k: '5:4', size: '1280x1024', g: '横版' }, { k: '4:3', size: '1440x1080', g: '横版' },
  { k: '3:2', size: '1536x1024', g: '横版' }, { k: '16:9', size: '1920x1080', g: '横版' }
]
const STRICT = ['1:1', '2:3', '3:2']
// gpt-image-2 / gemini 支持全部画幅；但 gpt-image-2-light(标准) 只支持通用 3 档，故排除 light。
const anyRatio = (m: string): boolean => /gemini/i.test(m || '') || /gpt-image-2(?!-?light)/i.test(m || '')
const ratioOK = (m: string, k: string): boolean => anyRatio(m) || STRICT.includes(k)
const sizeOf = (k: string): string => (RATIOS.find((r) => r.k === k) || RATIOS[0]).size
type ModelMeta = Record<string, { mode: string; credits: number; ref: boolean; label?: string }>
const MODEL_LABEL: Record<string, string> = { 'gpt-image-1-mini': '快速', 'gpt-image-2': '高质量GPT', 'gpt-image-2-all': '高质量GPT', 'gpt-image-2-light': '标准', 'gemini-2.5-flash-image': 'Nano Banana' }
const mLabel = (m: string): string => MODEL_LABEL[m] || m
// 生成图保存文件名：1.png … 100.png 循环。用模块级计数器（可靠递增，不受 localStorage 是否可用影响），
// localStorage 仅用于跨会话续号（写不进也没关系）。
let imgSeq = 0
function nextImgName(): string {
  if (imgSeq === 0) {
    try { imgSeq = parseInt(localStorage.getItem('cogpt_img_seq') || '0', 10) || 0 } catch { /* ignore */ }
  }
  imgSeq = (imgSeq % 100) + 1
  try { localStorage.setItem('cogpt_img_seq', String(imgSeq)) } catch { /* ignore */ }
  return `${imgSeq}.png`
}
// 下载图片：先转 Blob 再下载，确保浏览器一定采用我们给的文件名（data:URL 在部分浏览器/手机端会被忽略导致重名）。
async function downloadImage(src: string): Promise<void> {
  const name = nextImgName()
  try {
    const blob = await (await fetch(src)).blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  } catch {
    const a = document.createElement('a')
    a.href = src
    a.download = name
    a.click()
  }
}
const HD = [{ k: 'std', t: '标准', edge: 0 }, { k: 'hd', t: '高清', edge: 1536 }, { k: 'uhd', t: '超清', edge: 2048 }]
const isMobileUA = (): boolean => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent)
const uid = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2))

interface Quota { memberActive: boolean; memberTier: string; memberCredits: number; memberExpiresAt: string | null; bonusCredits: number; freeRemaining: number; freeDaily: number; inviteCode?: string; inviteCount?: number }
interface Msg { role: 'user' | 'assistant'; text?: string; refs?: string[]; img?: string; error?: string; note?: string }

let token: string | null = null
async function apiCall(path: string, opts: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as any) }
  if (token) headers['authorization'] = `Bearer ${token}`
  try {
    const r = await fetch(path, { ...opts, headers })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
  } catch { return { ok: false, status: 0, data: { error: '网络异常' } } }
}

/* ---------- 对话本地存储（IndexedDB，按设备保存，零服务器成本） ---------- */
function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('cogpt', 1)
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' }); if (!db.objectStoreNames.contains('full')) db.createObjectStore('full', { keyPath: 'id' }) }
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    } catch (e) { rej(e) }
  })
}
async function dbSave(c: { id: string; title: string; at: number; msgs: Msg[] }): Promise<void> {
  try { const db = await openDB(); await new Promise((res) => { const tx = db.transaction(['meta', 'full'], 'readwrite'); tx.objectStore('meta').put({ id: c.id, title: c.title, at: c.at }); tx.objectStore('full').put({ id: c.id, msgs: c.msgs }); tx.oncomplete = () => res(null); tx.onerror = () => res(null) }) } catch { /* 忽略 */ }
}
async function dbMetas(): Promise<{ id: string; title: string; at: number }[]> {
  try { const db = await openDB(); return await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const rq = tx.objectStore('meta').getAll(); rq.onsuccess = () => res((rq.result || []).sort((a: any, b: any) => b.at - a.at)); rq.onerror = () => res([]) }) } catch { return [] }
}
async function dbLoad(id: string): Promise<Msg[]> {
  try { const db = await openDB(); return await new Promise((res) => { const tx = db.transaction('full', 'readonly'); const rq = tx.objectStore('full').get(id); rq.onsuccess = () => res(rq.result ? rq.result.msgs : []); rq.onerror = () => res([]) }) } catch { return [] }
}
async function dbDel(id: string): Promise<void> {
  try { const db = await openDB(); await new Promise((res) => { const tx = db.transaction(['meta', 'full'], 'readwrite'); tx.objectStore('meta').delete(id); tx.objectStore('full').delete(id); tx.oncomplete = () => res(null); tx.onerror = () => res(null) }) } catch { /* 忽略 */ }
}

function readShrink(file: File, maxEdge = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader(); fr.onerror = () => reject(new Error('读取失败'))
    fr.onload = () => { const img = new Image(); img.onload = () => { const scale = Math.min(1, maxEdge / Math.max(img.width, img.height)); const w = Math.round(img.width * scale), h = Math.round(img.height * scale); const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h); resolve(c.toDataURL('image/jpeg', 0.85)) }; img.onerror = () => reject(new Error('图片无效')); img.src = fr.result as string }
    fr.readAsDataURL(file)
  })
}
function upscale(dataUrl: string, longEdge: number): Promise<string> {
  return new Promise((resolve) => {
    if (!longEdge) return resolve(dataUrl)
    const img = new Image(); img.onload = () => { const scale = longEdge / Math.max(img.width, img.height); if (scale <= 1) return resolve(dataUrl); const w = Math.round(img.width * scale), h = Math.round(img.height * scale); const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h); resolve(c.toDataURL('image/png')) }; img.onerror = () => resolve(dataUrl); img.src = dataUrl
  })
}

// 局部重绘蒙版（与桌面版一致：不透明=保留，透明=要重绘的区域）
function buildMask(w: number, h: number, strokes: { pts: number[]; size: number }[]): string {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const st of strokes) {
    const p = st.pts; if (p.length < 2) continue
    ctx.lineWidth = st.size; ctx.beginPath(); ctx.moveTo(p[0], p[1])
    if (p.length === 2) ctx.lineTo(p[0] + 0.01, p[1] + 0.01)
    else for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
    ctx.stroke()
  }
  return c.toDataURL('image/png')
}

/* ---------- 图标（自绘 SVG，可商用） ---------- */
function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg className={s.logoSvg} width={size} height={size} viewBox="0 0 32 32" aria-label="Co-GPT">
      <defs><linearGradient id="mlogo" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#8b7bff" /><stop offset="0.55" stopColor="#7b5cff" /><stop offset="1" stopColor="#16a5c9" /></linearGradient></defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#mlogo)" />
      <path d="M17 4.5 Q17 14 26.5 14 Q17 14 17 23.5 Q17 14 7.5 14 Q17 14 17 4.5 Z" fill="#fff" />
      <path d="M9.5 19.7 Q9.5 23.5 13.3 23.5 Q9.5 23.5 9.5 27.3 Q9.5 23.5 5.7 23.5 Q9.5 23.5 9.5 19.7 Z" fill="#fff" opacity="0.92" />
    </svg>
  )
}
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IconGen = () => (<svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.7" /><path d="M21 15l-5-5-8 8" /></svg>)
const IconMember = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M3 17l2-9 4.5 4.5L12 6l2.5 6.5L19 8l2 9z" /><path d="M3 19h18" /></svg>)
const IconUser = () => (<svg viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3-6.2 7-6.2s7 2.6 7 6.2" /></svg>)
const IconImg = () => (<svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M21 15l-5-5-8 8" /></svg>)
const IconRatio = () => (<svg viewBox="0 0 24 24" {...stroke}><rect x="4" y="6" width="16" height="12" rx="1.5" /></svg>)
const IconHD = () => (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3l1.7 4.6L19 9l-4.3 1.4L13 15l-1.7-4.6L7 9l4.3-1.4z" /><path d="M6 14l.9 2.4L9 17l-2.1.8L6 20l-.9-2.2L3 17l2.1-.6z" /></svg>)
const IconSend = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M12 19V5M6 11l6-6 6 6" /></svg>)
const IconCamera = () => (<svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.4" /><path d="M8 7l1.4-2.5h5.2L16 7" /></svg>)
const IconAlbum = () => (<svg viewBox="0 0 24 24" {...stroke}><rect x="7" y="7" width="14" height="14" rx="2.5" /><path d="M3 17V5a2 2 0 0 1 2-2h12" /><circle cx="11" cy="12" r="1.4" /><path d="M21 18l-4-4-6 6" /></svg>)
const IconHistory = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg>)
const IconPlus = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M12 5v14M5 12h14" /></svg>)
const IconBrush = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M9.5 14.5L18 6a2.1 2.1 0 0 1 3 3l-8.5 8.5" /><path d="M9.5 14.5a3 3 0 0 0-3 3c0 1-1 2-2.5 2 1-1 1-2 1-3a3 3 0 0 1 4.5-2z" /></svg>)
const IconTrash = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>)
const IconRef = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M21.4 11l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>)
const IconSave = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>)
const IconQuote = () => (<svg viewBox="0 0 24 24" {...stroke}><path d="M17 6H3M21 12H8M21 18H8M3 12v6" /></svg>)

export default function MobileApp() {
  const [ready, setReady] = useState(false)
  const [phone, setPhone] = useState('')
  const [quota, setQuota] = useState<Quota | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelMeta, setModelMeta] = useState<ModelMeta>({})
  const [tab, setTab] = useState<'gen' | 'member' | 'me'>('gen')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [convId, setConvId] = useState<string>(uid())
  const [metas, setMetas] = useState<{ id: string; title: string; at: number }[]>([])
  const [drawer, setDrawer] = useState(false)
  const member = !!quota?.memberActive

  useEffect(() => {
    token = localStorage.getItem(TOKEN_KEY)
    ;(async () => {
      if (token) {
        const me = await apiCall('/api/me')
        if (me.ok) {
          setPhone(me.data.phone); setQuota(me.data)
          const m = await apiCall('/api/models'); setModels(m.data.models || []); setModelMeta(m.data.meta || {})
          const ms = await dbMetas(); setMetas(ms)
          if (ms[0]) { setConvId(ms[0].id); setMsgs(await dbLoad(ms[0].id)) }
        } else { token = null; localStorage.removeItem(TOKEN_KEY) }
      }
      setReady(true)
    })()
  }, [])

  // 当前对话变化即保存到本地（切到会员/我的页再回来不丢；刷新也不丢）
  useEffect(() => {
    if (!msgs.length) return
    const title = (msgs.find((m) => m.role === 'user')?.text || '新对话').slice(0, 24)
    dbSave({ id: convId, title, at: Date.now(), msgs }).then(() => dbMetas().then(setMetas))
  }, [msgs, convId])

  async function refresh() { const me = await apiCall('/api/me'); if (me.ok) setQuota(me.data) }
  function logout() { token = null; localStorage.removeItem(TOKEN_KEY); setQuota(null); setPhone(''); setMsgs([]) }
  async function newConv() {
    if (!member && convId) await dbDel(convId) // 免费用户只保留当前一段
    setConvId(uid()); setMsgs([]); setDrawer(false); setTab('gen'); setMetas(await dbMetas())
  }
  async function openConv(id: string) { setConvId(id); setMsgs(await dbLoad(id)); setDrawer(false); setTab('gen') }
  async function delConv(id: string) { await dbDel(id); const ms = await dbMetas(); setMetas(ms); if (id === convId) { setConvId(uid()); setMsgs([]) } }

  if (!ready) return <div className={s.app}><div className={s.center}>正在启动…</div></div>
  if (!quota) return <Login onOk={(p, q, ms, meta) => { setPhone(p); setQuota(q); setModels(ms); setModelMeta(meta || {}) }} />

  const credit = (quota.memberActive ? `${quota.memberCredits} 点` : `免费 ${quota.freeRemaining}/${quota.freeDaily} 点`) + (quota.bonusCredits ? ` · 赠${quota.bonusCredits}` : '')
  return (
    <div className={s.app}>
      <div className={s.glow} /><div className={s.glow2} />
      {drawer && <>
        <div className={s.mask} onClick={() => setDrawer(false)} />
        <div className={s.drawer}>
          <div className={s.drawerHead}><IconHistory /> 历史对话</div>
          <button className={s.newBtn} onClick={newConv}><IconPlus /> 新对话</button>
          {member ? (
            <div className={s.convList}>
              {metas.length === 0 && <p className={s.lockNote}>还没有历史对话</p>}
              {metas.map((c) => (
                <div key={c.id} className={`${s.convItem} ${c.id === convId ? s.on : ''}`}>
                  <span className={s.ct} onClick={() => openConv(c.id)}>{c.title || '新对话'}</span>
                  <button className={s.convDel} onClick={() => delConv(c.id)} aria-label="删除"><IconTrash /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.lockNote}>多对话历史记录是<b style={{ color: '#b06cff' }}>会员专享</b>功能。<br />开通会员后可保存、切换多段历史对话。<br /><br /><button className={s.btn} onClick={() => { setDrawer(false); setTab('member') }}>去开通会员</button></div>
          )}
        </div>
      </>}
      <div className={s.topbar}>
        <button className={s.topBtn} onClick={() => setDrawer(true)} aria-label="历史对话"><IconHistory /></button>
        <div className={s.brand} style={{ marginLeft: 2 }}><LogoMark /> Co-GPT</div>
        <button className={s.topBtn} style={{ marginLeft: 'auto' }} onClick={newConv} aria-label="新对话"><IconPlus /></button>
        <span className={s.credit} style={{ marginLeft: 4 }}>{credit}</span>
      </div>
      <div style={{ display: tab === 'gen' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
        <Generate models={models} meta={modelMeta} msgs={msgs} setMsgs={setMsgs} onQuota={setQuota} />
      </div>
      {tab === 'member' && <div className={s.body}><MemberTab quota={quota} onRefresh={refresh} /></div>}
      {tab === 'me' && <div className={s.body}><Me phone={phone} quota={quota} onLogout={logout} /></div>}
      <div className={s.tabbar}>
        <button className={`${s.tab} ${tab === 'gen' ? s.on : ''}`} onClick={() => setTab('gen')}><IconGen />生图</button>
        <button className={`${s.tab} ${tab === 'member' ? s.on : ''}`} onClick={() => setTab('member')}><IconMember />会员</button>
        <button className={`${s.tab} ${tab === 'me' ? s.on : ''}`} onClick={() => setTab('me')}><IconUser />我的</button>
      </div>
    </div>
  )
}

function Login({ onOk }: { onOk: (p: string, q: Quota, ms: string[], meta: ModelMeta) => void }) {
  const [phone, setPhone] = useState(''); const [code, setCode] = useState(''); const [cd, setCd] = useState(0)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [agreed, setAgreed] = useState(false)
  const [invite, setInvite] = useState('')
  const phoneOk = /^1[3-9]\d{9}$/.test(phone)
  useEffect(() => { if (cd <= 0) return; const t = setTimeout(() => setCd((c) => c - 1), 1000); return () => clearTimeout(t) }, [cd])
  async function sendCode() { if (!phoneOk || cd > 0) return; setErr(''); setBusy(true); const r = await apiCall('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ phone }) }); setBusy(false); if (r.ok) setCd(60); else setErr(r.data?.error || '发送失败') }
  async function login() {
    if (!phoneOk || code.length < 4) return
    if (!agreed) { setErr('请先勾选同意协议'); return }
    setErr(''); setBusy(true)
    const r = await apiCall('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, code, invite }) })
    if (!r.ok || !r.data?.token) { setBusy(false); setErr(r.data?.error || '登录失败'); return }
    token = r.data.token; localStorage.setItem(TOKEN_KEY, token!)
    const me = await apiCall('/api/me'); const m = await apiCall('/api/models'); setBusy(false); onOk(me.ok ? me.data.phone : phone, me.data, m.data.models || [], m.data.meta || {})
  }
  return (
    <div className={s.app}><div className={s.glow} /><div className={s.body}>
      <div className={s.hero}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><LogoMark size={56} /></div>
        <h1 className={s.heroTitle} style={{ fontSize: 30 }}>Co-GPT</h1>
        <p className={s.heroSub}>对话即创作 · 手机号登录即可使用<br />无需翻墙 · 无需 GPT 账号或邮箱</p>
      </div>
      <div className={s.label}>手机号</div>
      <input className={s.field} inputMode="numeric" maxLength={11} placeholder="请输入手机号" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
      <div className={s.label}>验证码</div>
      <div className={s.row}>
        <input className={s.field} inputMode="numeric" maxLength={6} placeholder="6 位验证码" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <button className={`${s.btn} ${s.btnGhost}`} style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 16px' }} disabled={!phoneOk || cd > 0 || busy} onClick={sendCode}>{cd > 0 ? `${cd}s` : '获取验证码'}</button>
      </div>
      <div className={s.label}>邀请码（选填）</div>
      <input className={s.field} maxLength={12} placeholder="有邀请码填这里，注册各得免费次数" value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      {err && <p className={`${s.notice} ${s.err}`}>{err}</p>}
      <label className={s.notice} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>我已阅读并同意 <a className={s.link} href="/terms">《用户协议》</a> 和 <a className={s.link} href="/privacy">《隐私政策》</a></span>
      </label>
      <div style={{ height: 16 }} />
      <button className={s.btn} disabled={!phoneOk || code.length < 4 || busy || !agreed} onClick={login}>登录 / 注册</button>
      <p className={s.notice}>未注册的手机号将自动创建账号。</p>
    </div></div>
  )
}

// 长按（移动端）/ 右键（桌面）触发
function longPress(onFire: (x: number, y: number) => void) {
  let timer: any = null
  const clear = () => { if (timer) { clearTimeout(timer); timer = null } }
  return {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; const x = t.clientX, y = t.clientY; clear(); timer = setTimeout(() => onFire(x, y), 460) },
    onTouchEnd: clear,
    onTouchMove: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onFire(e.clientX, e.clientY) }
  }
}

// 局部重绘 / 图片编辑（手机端）
function Editor({ src, model, onClose, onResult }: { src: string; model: string; onClose: () => void; onResult: (d: string) => void }) {
  const [working, setWorking] = useState(src)
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const [disp, setDisp] = useState({ w: 0, h: 0 })
  const [strokes, setStrokes] = useState<{ pts: number[]; size: number }[]>([])
  const [brush, setBrush] = useState(44)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)
  const canRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  function measure() { const im = imgRef.current; if (!im) return; const r = im.getBoundingClientRect(); setNat({ w: im.naturalWidth, h: im.naturalHeight }); setDisp({ w: r.width, h: r.height }) }
  useEffect(() => {
    const c = canRef.current; if (!c || !disp.w) return
    c.width = disp.w; c.height = disp.h
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, disp.w, disp.h)
    const sc = disp.w / (nat.w || 1)
    ctx.strokeStyle = 'rgba(255,80,80,.5)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const st of strokes) { const p = st.pts; if (p.length < 2) continue; ctx.lineWidth = st.size * sc; ctx.beginPath(); ctx.moveTo(p[0] * sc, p[1] * sc); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * sc, p[i + 1] * sc); ctx.stroke() }
  }, [strokes, disp, nat])
  function pt(e: any) { const c = canRef.current!; const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (nat.w / (disp.w || 1)), y: (t.clientY - r.top) * (nat.h / (disp.h || 1)) } }
  function down(e: any) { drawing.current = true; const { x, y } = pt(e); setStrokes((p) => [...p, { pts: [x, y], size: brush }]) }
  function move(e: any) { if (!drawing.current) return; if (e.preventDefault) e.preventDefault(); const { x, y } = pt(e); setStrokes((p) => { const n = p.slice(); const l = n[n.length - 1]; if (l) l.pts = [...l.pts, x, y]; return n }) }
  function up() { drawing.current = false }
  async function repaint() {
    if (!prompt.trim() || strokes.length === 0) { alert('请先涂抹要修改的区域，并填写要改成什么'); return }
    const mask = buildMask(nat.w, nat.h, strokes)
    setBusy('正在重绘选中区域…')
    const body = JSON.stringify({ prompt: prompt.trim(), model, size: `${nat.w}x${nat.h}`, initImages: [working], mask, reqId: uid() })
    let res: any = null, last = '重绘失败'
    for (let i = 1; i <= 3; i++) { if (i > 1) setBusy(`重绘失败，正在重试(${i}/3)…`); res = await apiCall('/api/generate', { method: 'POST', body }); if (res.status === 402 || res.data?.needRecharge) { last = '额度已用完，请到会员开通'; res = null; break } if (res.status === 400) { last = res.data?.error || '请求有误'; res = null; break } if (res.ok && res.data.images?.length) break; last = res.data?.error || last }
    setBusy('')
    if (res && res.ok && res.data.images?.[0]) { setWorking(res.data.images[0]); setStrokes([]); setPrompt(''); onResult(res.data.images[0]) } else alert(last)
  }
  return (
    <div className={s.editor}>
      <div className={s.editorTop}><button className={s.editTopBtn} onClick={onClose}>取消</button><b>局部重绘</b><button className={s.editTopBtn} style={{ color: 'var(--brand2)' }} onClick={() => { void downloadImage(working) }}>保存</button></div>
      <div className={s.editorImgWrap}>
        <div className={s.editStage}>
          <img ref={imgRef} src={working} onLoad={measure} alt="编辑" />
          <canvas ref={canRef} className={s.editCanvas} style={{ width: disp.w, height: disp.h }}
            onTouchStart={down} onTouchMove={move} onTouchEnd={up}
            onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} />
        </div>
        {busy && <div className={s.busyMask}><span className={s.spin} style={{ marginRight: 8 }} />{busy}</div>}
      </div>
      <div className={s.editBar}>
        <div className={s.editTools}>画笔 {brush}px <input type="range" min={12} max={140} value={brush} onChange={(e) => setBrush(+e.target.value)} /><button className={s.menuItem} style={{ width: 'auto', padding: '4px 10px' }} onClick={() => setStrokes([])}>清除涂抹</button></div>
        <div className={s.inputRow}><textarea placeholder="涂抹要改的区域，并描述改成什么，如：把背景换成蓝天" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={1} /><button className={s.sendBtn} onClick={repaint}><IconBrush /></button></div>
      </div>
    </div>
  )
}

function Generate({ models, meta, msgs, setMsgs, onQuota }: { models: string[]; meta: ModelMeta; msgs: Msg[]; setMsgs: (f: (p: Msg[]) => Msg[]) => void; onQuota: (q: Quota) => void }) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(models[0] || '')
  const [ratio, setRatio] = useState('1:1')
  const [hd, setHd] = useState('std')
  const [refs, setRefs] = useState<string[]>([])
  // panel：底部弹出面板。'set'=画质/比例/高清统一设置（即梦式右侧设置整合到一个紧凑面板），'ref'=参考图上传方式选择。
  const [panel, setPanel] = useState<'set' | 'ref' | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [canAbort, setCanAbort] = useState(false)
  const [mode, setMode] = useState<'gen' | 'chat'>('gen')
  const [menu, setMenu] = useState<{ x: number; y: number; items: { icon?: ReactNode; label: string; fn: () => void }[] } | null>(null)
  const [editSrc, setEditSrc] = useState<string | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const albRef = useRef<HTMLInputElement>(null)
  const editUpRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  useEffect(() => { if (model && !ratioOK(model, ratio)) setRatio('1:1') }, [model, ratio])
  // —— 两档质量模式：标准(gpt-image-2-light,额度1,无参考图) / 高质量(可切模型,额度2,image2可参考图) ——
  const curMeta = meta[model] || { mode: 'quality', credits: 10, ref: true }
  const isStd = curMeta.mode === 'standard'
  const refAllowed = !!curMeta.ref
  const stdModels = models.filter((m) => meta[m]?.mode === 'standard')
  const qModels = models.filter((m) => meta[m]?.mode !== 'standard')
  function pickTier(t: 'standard' | 'quality'): void {
    // 切到标准：清空参考图（标准档不支持参考图），但保留设置面板打开，方便继续调比例/高清。
    const list = t === 'standard' ? stdModels : qModels
    if (!list.length || list.includes(model)) { if (t === 'standard') { setRefs([]); setPanel('set') }; return }
    setModel(list[0])
    if (t === 'standard') { setRefs([]); setPanel('set') }
  }
  useEffect(() => { if (!refAllowed && refs.length) setRefs([]) }, [refAllowed, refs.length])

  function imgMenu(x: number, y: number, img: string) {
    const items: { icon?: ReactNode; label: string; fn: () => void }[] = []
    if (refAllowed) {
      // 改图/参考图仅在支持参考图的模型(高质量 image2)下可用
      items.push({ icon: <IconBrush />, label: '局部重绘 / 编辑', fn: () => setEditSrc(img) })
      items.push({ icon: <IconRef />, label: '引用为参考图', fn: () => setRefs((p) => [...p, img].slice(0, 4)) })
    }
    items.push({ icon: <IconSave />, label: '保存图片', fn: () => { void downloadImage(img) } })
    setMenu({ x, y, items })
  }
  function textMenu(x: number, y: number, t: string) {
    setMenu({ x, y, items: [{ icon: <IconQuote />, label: '引用这段文字', fn: () => setPrompt((v) => (v ? v + ' ' + t : t)) }] })
  }
  async function pickEditUpload(files: FileList | null) { if (!files || !files[0]) return; try { setEditSrc(await readShrink(files[0], 1536)) } catch { /* skip */ } }
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  async function addFiles(files: FileList | null) {
    if (!files) return
    const arr: string[] = []
    for (const f of Array.from(files).slice(0, 4)) { try { arr.push(await readShrink(f)) } catch { /* skip */ } }
    if (arr.length) setRefs((p) => [...p, ...arr].slice(0, 4))
  }
  function extractGenPrompt(): string {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'assistant' && m.text) { const mm = /\[\[生图提示词\]\]\s*(.+)/.exec(m.text); if (mm) return mm[1].trim() }
    }
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user' && msgs[i].text) return msgs[i].text!.trim() }
    return ''
  }
  async function chatSend() {
    const p = prompt.trim()
    if (!p || busy) return
    if (/^(生成|出图|生成图片|开始生成|画吧|可以了|可以生成)$/.test(p)) {
      const gp = extractGenPrompt(); setPrompt('')
      if (gp) { await runGen(gp, []); return }
    }
    setPrompt('')
    const history = [...msgs.filter((m) => !!m.text).map((m) => ({ role: m.role, content: m.text as string })), { role: 'user', content: p }].slice(-12)
    setMsgs((prev) => [...prev, { role: 'user', text: p }])
    setBusy(true); setStatus('正在思考…')
    const r = await apiCall('/api/chat', { method: 'POST', body: JSON.stringify({ messages: history }) })
    setBusy(false); setStatus('')
    if (r.status === 402 || r.data?.needRecharge) { setMsgs((prev) => [...prev, { role: 'assistant', error: '额度已用完，请到「会员」开通/升级或邀请好友得免费次数' }]); return }
    if (r.ok && r.data?.reply) { setMsgs((prev) => [...prev, { role: 'assistant', text: r.data.reply }]); if (r.data.quota) onQuota(r.data.quota) }
    else setMsgs((prev) => [...prev, { role: 'assistant', error: r.data?.error || '对话失败' }])
  }
  async function gen() { await runGen(prompt.trim(), refs) }
  async function runGen(p: string, curRefs: string[]) {
    if ((!p && curRefs.length === 0) || busy) return
    setMsgs((prev) => [...prev, { role: 'user', text: p || '（参考图生成）', refs: curRefs.length ? curRefs : undefined }])
    setPrompt(''); setRefs([]); setPanel(null); setBusy(true)
    let sec = 0; const timer = setInterval(() => { sec++; setStatus(`正在生成…（已 ${sec}s，通常 30–60 秒）· 可点「中止」`) }, 1000)
    const reqId = uid()
    const body = JSON.stringify({ prompt: p, model, size: sizeOf(ratio), initImages: curRefs.length ? curRefs : undefined, reqId, hdEdge: HD.find((h) => h.k === hd)?.edge || 0 })
    const ac = new AbortController()
    // 中止：既中断本地等待，也通知服务端中止中转站请求并释放并发锁（穿透 Cloudflare）
    cancelRef.current = () => { ac.abort(); void apiCall('/api/generate/cancel', { method: 'POST', body: JSON.stringify({ reqId }) }) }
    setCanAbort(true)
    let res: any = null, last = '生成失败，请稍后再试', aborted = false
    for (let i = 1; i <= 3; i++) {
      if (i > 1) setStatus(`生成失败，正在自动重试 (${i}/3)…`)
      res = await apiCall('/api/generate', { method: 'POST', body, signal: ac.signal })
      if (ac.signal.aborted) { aborted = true; res = null; break } // 用户中止，不再重试
      if (res.status === 402 || res.data?.needRecharge) { last = '额度已用完，请到「会员」开通或升级'; res = null; break }
      if (res.status === 400) { last = res.data?.error || '请求有误'; res = null; break }
      if (res.status === 429) { last = res.data?.error || '上一张还在收尾，请等几秒再试'; res = null; break } // 忙，不重试
      if (res.ok && res.data.images && res.data.images.length) break
      last = res.data?.error || last
    }
    clearInterval(timer); setBusy(false); setStatus(''); cancelRef.current = null; setCanAbort(false)
    if (aborted) {
      setMsgs((prev) => [...prev, { role: 'assistant', error: '已中止生成（未出图，不计费）' }])
      const me = await apiCall('/api/me') // 刷新额度：若中止前已出图则实际已扣，这里如实显示
      if (me.ok) onQuota(me.data)
      return
    }
    if (res && res.ok && res.data.images?.length) {
      let out = res.data.images[0]
      const edge = HD.find((h) => h.k === hd)?.edge || 0
      if (edge) { setBusy(true); setStatus('正在生成高清大图…'); out = await upscale(out, edge); setBusy(false); setStatus('') }
      setMsgs((prev) => [...prev, { role: 'assistant', img: out, note: res.data.fallback ? '⚡ 高质量模型当前繁忙，已用「极速」模型为你生成（风格可能略有不同）' : undefined }])
      if (res.data.quota) onQuota(res.data.quota)
    } else setMsgs((prev) => [...prev, { role: 'assistant', error: last }])
  }
  const hdLabel = HD.find((h) => h.k === hd)?.t || '标准'
  return (
    <div className={s.genWrap}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={albRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={editUpRef} type="file" accept="image/*" hidden onChange={(e) => { pickEditUpload(e.target.files); e.target.value = '' }} />
      <div className={s.results} ref={scrollRef}>
        {msgs.length === 0 && !busy && (
          <div className={s.emptyHint}><b>描述你想要的画面，点右下角生成</b><br />例如：一只戴墨镜的柴犬，扁平插画，米色背景<br /><br />可在下方加「参考图」，点「设置」切画质 / 比例 / 高清</div>
        )}
        {msgs.map((m, i) => m.role === 'user' ? (
          <div className={s.msgUser} key={i}><div><div className={s.bubble} {...(m.text ? longPress((x, y) => textMenu(x, y, m.text!)) : {})}>{m.text}</div>{m.refs && m.refs.length > 0 && <div className={s.msgRefs}>{m.refs.map((r, j) => <img key={j} src={r} alt="参考图" />)}</div>}</div></div>
        ) : (
          <div className={s.msgAsst} key={i}>
            {m.img ? (<>
              {m.note && <p className={s.notice} style={{ color: '#ffd27a', marginBottom: 6 }}>{m.note}</p>}
              <img className={s.result} src={m.img} alt="生成结果" onClick={() => { if (refAllowed) setEditSrc(m.img!) }} {...longPress((x, y) => imgMenu(x, y, m.img!))} />
              <p className={s.notice} style={{ textAlign: 'center', marginTop: 4 }}>{refAllowed ? '点图可局部重绘/编辑 · 长按更多' : '长按可保存'}</p>
            </>) : m.text ? (
              <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--edge)', borderRadius: '14px 14px 14px 4px', padding: '9px 12px', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.6, maxWidth: '88%' }}>
                {m.text.replace(/\[\[生图提示词\]\]\s*/g, '提示词：')}
                {/\[\[生图提示词\]\]/.test(m.text) && (
                  <button style={{ display: 'block', marginTop: 8, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13 }} onClick={() => { const mm = /\[\[生图提示词\]\]\s*(.+)/.exec(m.text!); runGen(mm ? mm[1].trim() : extractGenPrompt(), []) }}>▶ 一键生成这张图</button>
                )}
              </div>
            ) : <div className={s.msgErr}>⚠️ {m.error}</div>}
          </div>
        ))}
        {busy && <div className={s.statusCard}><span className={s.spin} />{status || '正在生成…'}{canAbort && <button onClick={() => cancelRef.current?.()} style={{ marginLeft: 12, background: 'rgba(255,255,255,.12)', border: '1px solid var(--edge)', borderRadius: 8, color: 'var(--text)', padding: '4px 12px', fontSize: 13 }}>中止</button>}</div>}
      </div>
      <div className={s.inputZone}>
        {/* 参考图区域（缩略图）—— 在控件行之上 */}
        {mode === 'gen' && refs.length > 0 && (<div className={s.thumbs}>{refs.map((src, i) => (<div key={i} className={s.thumb}><img src={src} alt="参考图" /><button className={s.thumbX} onClick={() => setRefs((p) => p.filter((_, j) => j !== i))}>×</button></div>))}</div>)}
        {mode === 'gen' && refs.length >= 3 && (<div className={s.secTitle} style={{ color: '#ffd27a' }}>参考图越多生成越慢、越容易超时，建议精简到 1–2 张</div>)}

        {/* 弹出设置面板（即梦式：把标准/高质量档位 + 画质 + 高质量模型 + 比例整合到一个紧凑面板，从下方设置栏弹起）。 */}
        {mode === 'gen' && panel === 'set' && (
          <div className={s.setSheet}>
            {/* ② 画质档位：标准 / 高质量 */}
            {stdModels.length > 0 && qModels.length > 0 && (<>
              <div className={s.setRow}>
                <span className={s.setLabel}>画质档</span>
                <div className={s.seg}>
                  <button className={`${s.segBtn} ${isStd ? s.on : ''}`} onClick={() => pickTier('standard')}>标准</button>
                  <button className={`${s.segBtn} ${!isStd ? s.on : ''}`} onClick={() => pickTier('quality')}>高质量</button>
                </div>
              </div>
              <div className={s.setHint}>本次扣 {curMeta.credits} 点{isStd ? '（通用 3 比例）' : '（可换模型 / 参考图 / 全比例；多张参考图、超清会额外计点）'}</div>
            </>)}
            {/* ③ 高质量档展开模型选择：高质量GPT / Nano Banana */}
            {!isStd && qModels.length > 1 && (
              <div className={s.setRow}>
                <span className={s.setLabel}>模型</span>
                <div className={s.chips}>{qModels.map((m) => <button key={m} className={`${s.chip} ${m === model ? s.on : ''}`} onClick={() => setModel(m)}>{meta[m]?.label || mLabel(m)}</button>)}</div>
              </div>
            )}
            {/* 比例 */}
            <div className={s.setBlock}>
              <div className={s.setLabel}>比例 {!anyRatio(model) && <span style={{ color: '#ffd27a', fontWeight: 400 }}>（{meta[model]?.label || mLabel(model)} 仅 3 比例，9:16 等请切高质量）</span>}</div>
              <div className={s.chips}>{RATIOS.map((r) => { const ok = ratioOK(model, r.k); return <button key={r.k} disabled={!ok} className={`${s.chip} ${r.k === ratio ? s.on : ''}`} onClick={() => { if (ok) setRatio(r.k) }}>{r.k}</button> })}</div>
            </div>
            {/* 高清 */}
            <div className={s.setBlock}>
              <div className={s.setLabel}>高清（生成后本地放大，越高越清越慢）</div>
              <div className={s.chips}>{HD.map((h) => <button key={h.k} className={`${s.chip} ${h.k === hd ? s.on : ''}`} onClick={() => setHd(h.k)}>{h.t}</button>)}</div>
            </div>
          </div>
        )}

        {/* 参考图上传方式选择面板 */}
        {mode === 'gen' && panel === 'ref' && (<div className={s.setSheet}><div className={s.secTitle}>上传参考图（让 AI 参考其风格/构图，最多 4 张）</div><div className={s.uploadRow}><button className={s.uploadBtn} onClick={() => camRef.current?.click()}><IconCamera />拍照</button><button className={s.uploadBtn} onClick={() => albRef.current?.click()}><IconAlbum />从相册选择</button></div><button className={`${s.btn} ${s.btnGhost}`} style={{ marginTop: 10 }} onClick={() => editUpRef.current?.click()}><IconBrush /> 上传图片做局部重绘/编辑</button></div>)}

        {/* 单行控件：对话/生图 + 参考图 + 设置（即梦式，详细项收进「设置」弹层；手机自动换两行）。 */}
        <div className={s.ctrlRow}>
          <div className={s.modeSeg}>
            <button className={`${s.segBtn} ${mode === 'gen' ? s.on : ''}`} onClick={() => setMode('gen')}><IconGen />生图</button>
            <button className={`${s.segBtn} ${mode === 'chat' ? s.on : ''}`} onClick={() => { setMode('chat'); setPanel(null) }}><IconQuote />对话</button>
          </div>
          {mode === 'gen' && refAllowed && (
            <button className={`${s.toolBtn} ${panel === 'ref' ? s.on : ''}`} onClick={() => setPanel(panel === 'ref' ? null : 'ref')}><IconImg />参考图{refs.length ? `(${refs.length})` : ''}</button>
          )}
          {mode === 'gen' && (
            <button className={`${s.toolBtn} ${panel === 'set' ? s.on : ''}`} onClick={() => setPanel(panel === 'set' ? null : 'set')}><IconHD />{isStd ? '标准' : '高质量'} · {ratio} · {hdLabel}</button>
          )}
        </div>
        <div className={s.inputRow}>
          <textarea placeholder={mode === 'chat' ? '说说你想要的图，我帮你聊清楚（想好了回复「生成」即可出图）' : '描述你想要的画面…'} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={1} />
          <button className={s.sendBtn} disabled={busy || (mode === 'gen' ? (!prompt.trim() && refs.length === 0) : !prompt.trim())} onClick={() => (mode === 'chat' ? chatSend() : gen())}><IconSend /></button>
        </div>
      </div>
      {menu && (<>
        <div style={{ position: 'fixed', inset: 0, zIndex: 54 }} onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
        <div className={s.menu} style={{ left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 360) - 180), top: Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 640) - 160) }}>
          {menu.items.map((it, i) => <button key={i} className={s.menuItem} onClick={() => { it.fn(); setMenu(null) }}>{it.icon}{it.label}</button>)}
        </div>
      </>)}
      {editSrc && <Editor src={editSrc} model={model} onClose={() => setEditSrc(null)} onResult={(d) => setMsgs((prev) => [...prev, { role: 'assistant', img: d }])} />}
    </div>
  )
}

function MemberTab({ quota, onRefresh }: { quota: Quota; onRefresh: () => void }) {
  const [tiers, setTiers] = useState<{ id: string; name: string; priceCents: number; quota: number }[]>([])
  const [pay, setPay] = useState<{ name: string; amount: string; qrImg?: string; payUrl?: string; outTradeNo: string } | null>(null)
  const [paid, setPaid] = useState(false); const [busy, setBusy] = useState('')
  useEffect(() => { apiCall('/api/tiers').then((r) => r.ok && setTiers(r.data.tiers)) }, [])
  useEffect(() => {
    if (!pay || paid) return
    let stop = false
    const t = setInterval(async () => { const r = await apiCall('/api/pay/status?outTradeNo=' + encodeURIComponent(pay.outTradeNo)); if (!stop && r.ok && r.data.paid) { clearInterval(t); setPaid(true); onRefresh() } }, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [pay, paid, onRefresh])
  async function buy(id: string, name: string, priceCents: number) {
    setBusy(id); const r = await apiCall('/api/pay/create', { method: 'POST', body: JSON.stringify({ tier: id }) }); setBusy('')
    if (!(r.ok && (r.data.qrImg || r.data.payUrl) && r.data.outTradeNo)) { alert(r.data?.error || '下单失败'); return }
    if (isMobileUA() && r.data.payUrl) { window.location.href = r.data.payUrl; return } // 手机端直跳支付宝
    setPaid(false); setPay({ name, amount: r.data.amount || (priceCents / 100).toString(), qrImg: r.data.qrImg, payUrl: r.data.payUrl, outTradeNo: r.data.outTradeNo })
  }
  if (pay) return (<div>{paid ? (<div className={s.hero}><div style={{ fontSize: 46 }}>✅</div><h2 className={s.heroTitle}>支付成功</h2><p className={s.heroSub}>额度已到账，去生图吧！</p><div style={{ height: 12 }} /><button className={s.btn} onClick={() => setPay(null)}>完成</button></div>) : (<div className={s.qrWrap}><button className={`${s.btn} ${s.btnGhost}`} style={{ width: 'auto', padding: '6px 14px', marginBottom: 14 }} onClick={() => setPay(null)}>← 返回</button><div className={s.muted}>{pay.name}</div><div className={s.price}>¥{pay.amount}</div>{pay.qrImg ? <img className={s.qrImg} src={pay.qrImg} alt="支付二维码" /> : <button className={s.btn} onClick={() => pay.payUrl && window.open(pay.payUrl)}>打开支付</button>}<p className={s.notice}>电脑端请用支付宝扫码支付，到账后自动开通。</p></div>)}</div>)
  return (
    <div>
      <div className={s.hero} style={{ paddingTop: 6 }}>
        <h2 className={s.heroTitle}><span className={s.grad}>开通会员</span></h2>
        <p className={s.heroSub}>{quota.memberActive ? `当前 ${quota.memberTier} · 剩余 ${quota.memberCredits} 次` : `免费 ${quota.freeRemaining}/${quota.freeDaily} 今日 · 生图失败不扣次`}</p>
      </div>
      <div className={s.acct} style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>会员特权</div>
        <div className={s.muted} style={{ lineHeight: 2 }}>✓ 高质量 GPT 生图模型<br />✓ 9:16 等任意比例、不裁切<br />✓ <b style={{ color: '#b06cff' }}>多对话历史记录</b>（保存/回看多段对话）<br />✓ 局部重绘 / 参考图 · 生图失败不扣次</div>
      </div>
      {tiers.map((t) => (
        <div key={t.id} className={`${s.tier} ${t.id === 'plus' ? s.hot : ''}`}>
          <div className={s.tierName}>{t.name}{t.id === 'plus' ? ' · 最受欢迎' : ''}</div>
          <div className={s.price}>¥{t.priceCents / 100}<small> /月</small></div>
          <div className={s.tierQuota}>每月 {t.quota} 次生图</div>
          <button className={s.btn} disabled={busy === t.id} onClick={() => buy(t.id, t.name, t.priceCents)}>{busy === t.id ? '下单中…' : '立即开通'}</button>
        </div>
      ))}
    </div>
  )
}

function Me({ phone, quota, onLogout }: { phone: string; quota: Quota; onLogout: () => void }) {
  const [copied, setCopied] = useState(false)
  const code = quota.inviteCode || ''
  const promo = `最近在用一个 AI 生图工具，挺惊艳的——用的是 GPT-image2，出图质量是真高。价格也不贵，现在有个 9.9 的套餐挺超值。你注册的时候填我的邀请码 ${code}，能白送你 10 次免费生图。国内直接打开就能用，不用翻墙：https://cogpt.art/app`
  async function copyPromo() {
    try {
      await navigator.clipboard.writeText(promo)
    } catch {
      const t = document.createElement('textarea')
      t.value = promo
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <div>
      <div className={s.acct}>
        <div className={s.muted}>手机号</div><div style={{ fontSize: 18, fontWeight: 600 }}>{phone}</div>
        <div style={{ height: 12 }} />
        <div className={s.muted}>{quota.memberActive ? '会员额度剩余' : '今日免费额度'}</div>
        <div className={s.acctBig}>{quota.memberActive ? `${quota.memberCredits} 次` : `${quota.freeRemaining} / ${quota.freeDaily}`}{quota.bonusCredits ? ` + 赠送 ${quota.bonusCredits} 次` : ''}</div>
        {quota.memberActive && quota.memberExpiresAt && <div className={s.muted}>到期：{new Date(quota.memberExpiresAt).toLocaleDateString()}</div>}
      </div>
      <div style={{ height: 16 }} />
      <div className={s.acct}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>邀请好友 · 各得免费次数</div>
        <div className={s.muted} style={{ lineHeight: 1.7 }}>朋友注册时填你的邀请码：<b>TA 得 10 次，你得 30 次</b>。已成功邀请 <b style={{ color: '#b06cff' }}>{quota.inviteCount || 0}</b> 人。</div>
        <div style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 3, fontWeight: 700, background: 'rgba(255,255,255,.06)', border: '1px solid var(--edge)', borderRadius: 10, padding: '10px 14px', textAlign: 'center', margin: '12px 0' }}>{code || '——'}</div>
        <button className={s.btn} onClick={copyPromo}>{copied ? '已复制，去粘贴给朋友吧' : '一键复制邀请文案'}</button>
      </div>
      <div style={{ height: 16 }} />
      <button className={`${s.btn} ${s.btnGhost}`} onClick={onLogout}>退出登录</button>
      <p className={s.notice}>生图全部由 Co-GPT 云端完成，安全可靠。<br /><a className={s.link} href="/terms">用户协议</a> · <a className={s.link} href="/privacy">隐私政策</a></p>
    </div>
  )
}
