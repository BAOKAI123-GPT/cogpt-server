// 服务端联网搜索（无 API key），跑在 cogpt.art 的 VPS（国内网络）。
// 策略：百度优先（对中文中小企业/B2B 收录好），被反爬时回退 Bing（稳定）。
// DuckDuckGo 在中国大陆被墙，已弃用。
// 安全：抓取任意网址前校验主机为公网（防 SSRF：内网/云元数据 169.254.x、localhost 等一律拒绝）。
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

async function withTimeout<T>(ms: number, fn: (s: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    return await fn(c.signal)
  } finally {
    clearTimeout(t)
  }
}

// ---------------- SSRF 防护 ----------------
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const p = ip.split('.').map(Number)
    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 169 && p[1] === 254) || // 链路本地 / 云元数据
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || // CGNAT（含部分云元数据 100.100.x）
      p[0] >= 224
    )
  }
  if (v === 6) {
    const l = ip.toLowerCase().replace(/^\[|\]$/g, '')
    return (
      l === '::1' ||
      l === '::' ||
      l.startsWith('fe80') ||
      l.startsWith('fc') ||
      l.startsWith('fd') ||
      l.startsWith('::ffff:')
    )
  }
  return true
}

async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    !h ||
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === 'metadata.tencentyun.com' ||
    h === 'metadata.google.internal'
  ) {
    throw new Error('blocked host')
  }
  if (isIP(h)) {
    if (isPrivateIp(h)) throw new Error('blocked ip')
    return
  }
  const addrs = await lookup(h, { all: true })
  if (!addrs.length) throw new Error('no dns')
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error('blocked resolved ip')
}

/** 仅抓公网 http(s) 网址；手动跟跳转并逐跳校验，防 SSRF */
async function safeFetch(rawUrl: string, ms: number, maxRedirects = 3): Promise<Response> {
  let url = rawUrl
  for (let i = 0; i <= maxRedirects; i++) {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      throw new Error('bad url')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('blocked protocol')
    await assertPublicHost(u.hostname)
    const res = await withTimeout(ms, (s) =>
      fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh' },
        redirect: 'manual',
        signal: s
      })
    )
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      url = new URL(loc, url).toString()
      continue
    }
    return res
  }
  throw new Error('too many redirects')
}

// ---------------- 百度 ----------------
/** 百度结果链接是 http://www.baidu.com/link?url=... 的跳转，HEAD 跟一跳拿真实地址 */
async function resolveBaidu(href: string): Promise<string> {
  if (!/^https?:\/\/(www\.)?baidu\.com\/link\?/.test(href)) return href
  try {
    const r = await withTimeout(6000, (s) =>
      fetch(href, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA }, signal: s })
    )
    const loc = r.headers.get('location')
    return loc && /^https?:\/\//.test(loc) ? loc : href
  } catch {
    return href
  }
}

async function baidu(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.max(limit, 10)}`
  const res = await withTimeout(15000, (s) =>
    fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh',
        Accept: 'text/html,application/xhtml+xml',
        Cookie: 'BAIDUID=0000000000000000000000000000:FG=1; BIDUPSID=0000'
      },
      signal: s
    })
  )
  const html = await res.text()
  if (html.length < 3000 || /百度安全验证|wappass|passport\.baidu\.com\/static|网络不给力/.test(html)) {
    throw new Error('baidu anti-bot')
  }
  const titleRe =
    /<h3[^>]*class="[^"]*(?:\bt\b|c-title)[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const matches = [...html.matchAll(titleRe)]
  const raw: { title: string; href: string; snippet: string }[] = []
  for (let i = 0; i < matches.length && raw.length < limit; i++) {
    const m = matches[i]
    const title = stripTags(m[2])
    if (!title) continue
    const start = (m.index ?? 0) + m[0].length
    const end = matches[i + 1]?.index ?? Math.min(start + 3000, html.length)
    const block = html.slice(start, end)
    const snippet = stripTags(block).slice(0, 220)
    raw.push({ title, href: decodeEntities(m[1]), snippet })
  }
  const urls = await Promise.all(raw.map((r) => resolveBaidu(r.href)))
  return raw.map((r, i) => ({ title: r.title, url: urls[i], snippet: r.snippet }))
}

// ---------------- Bing（回退） ----------------
/** Bing 有时把链接包成 .../ck/a?...&u=a1<base64url>，还原真实地址 */
function bingRealUrl(href: string): string {
  const m = /[?&]u=a1([^&]+)/.exec(href)
  if (m) {
    try {
      let b = m[1].replace(/-/g, '+').replace(/_/g, '/')
      while (b.length % 4) b += '='
      const real = Buffer.from(b, 'base64').toString('utf8')
      if (/^https?:\/\//i.test(real)) return real
    } catch {
      /* ignore */
    }
  }
  return href
}

async function bing(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN&mkt=zh-CN&count=${limit}`
  const res = await withTimeout(15000, (s) =>
    fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh', Accept: 'text/html' },
      signal: s
    })
  )
  if (!res.ok) throw new Error(`bing HTTP ${res.status}`)
  const html = await res.text()
  const hits: SearchHit[] = []
  const blocks = html.split('<li class="b_algo"')
  for (let i = 1; i < blocks.length && hits.length < limit; i++) {
    const b = blocks[i]
    const lm = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b)
    if (!lm) continue
    const title = stripTags(lm[2])
    if (!title) continue
    const u = bingRealUrl(decodeEntities(lm[1]))
    const sm =
      /<p[^>]*class="[^"]*b_[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(b) || /<p[^>]*>([\s\S]*?)<\/p>/.exec(b)
    hits.push({ title, url: u, snippet: sm ? stripTags(sm[1]) : '' })
  }
  return hits
}

/** 联网搜索：百度优先，失败/被反爬回退 Bing */
export async function webSearch(query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const b = await baidu(q, limit)
    if (b.length) return b
  } catch {
    /* fall through to bing */
  }
  return bing(q, limit)
}

/** 取网页正文（去标签、截断），供模型阅读。仅抓公网网址（防 SSRF）。 */
export async function fetchPageText(url: string, maxChars = 4000): Promise<string> {
  try {
    const res = await safeFetch(url, 15000)
    if (!res.ok) return ''
    let html = await res.text()
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    return stripTags(html).slice(0, maxChars)
  } catch {
    return ''
  }
}
