import s from './page.module.css'
import { Logo } from './Logo'
import { getTiers, getConfig } from '@/lib/config'
import { IcChat, IcBrush, IcImage, IcVector, IcZoom, IcShield, IcSparkles, IcGlobe, IcPhone, IcZap, IcCheck, IcDownload } from './icons'
import { DownloadGuide } from './DownloadGuide'

// 始终服务端实时渲染：读取后台可改的价格/下载链接，改完即时生效
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Co-GPT · 对话即创作的 AI 生图工作台',
  description: 'Co-GPT 让你像聊天一样生成与编辑图片：对话生图、局部重绘、参考图、矢量化与高清放大。密钥云端托管，安全省心。Windows / macOS 客户端免费下载。'
}

const FEATURES = [
  { icon: <IcChat />, t: '对话生图', d: '像聊天一样描述画面即可出图，支持多轮「再改一点」连续创作。' },
  { icon: <IcBrush />, t: '局部重绘', d: '框选画面任意区域，只重画选中部分，其余保持不变。' },
  { icon: <IcImage />, t: '参考图生成', d: '拖入或粘贴图片作为参考，让 AI 沿用其风格与构图。' },
  { icon: <IcVector />, t: '一键矢量化', d: '位图转 SVG 矢量，无限放大不糊，达到印刷级精度。' },
  { icon: <IcZoom />, t: '本地高清放大', d: 'Lanczos 算法本地放大到 2K/4K，免费、不裁切、可直接打印。' },
  { icon: <IcShield />, t: '安全省心', d: '生图全部云端代发，接口密钥仅在服务器，客户端绝不接触。' }
]

function DownloadBtn({ url, label, sub }: { url: string; label: string; sub: string }) {
  if (!url) return <span className={`${s.btn} ${s.btnDisabled}`}>{label} · 敬请期待</span>
  return (
    <a className={`${s.btn} ${s.btnPrimary}`} href={url}>
      <IcDownload size={16} /> {label} <span style={{ opacity: 0.8, fontWeight: 400 }}>· {sub}</span>
    </a>
  )
}

export default async function Home() {
  const tiers = await getTiers()
  const winUrl = await getConfig('download_win_url')
  const macUrl = await getConfig('download_mac_url')
  const androidUrl = await getConfig('download_android_url')
  const version = await getConfig('app_version')
  const mirrorNote = await getConfig('download_mirror_note')
  const shots = ['s1', 's2', 's3', 's4', 's5', 's6']

  return (
    <div className={s.page}>
      <div className={s.glows}>
        <div className={`${s.glow} ${s.glow1}`} />
        <div className={`${s.glow} ${s.glow2}`} />
        <div className={`${s.glow} ${s.glow3}`} />
      </div>

      {/* 导航 */}
      <nav className={s.nav}>
        <div className={s.navInner}>
          <div className={s.brand}><Logo gradId="navLogo" /> Co-GPT</div>
          <div className={s.navLinks}>
            <a href="#features">功能</a>
            <a href="#gallery">作品</a>
            <a href="#pricing">价格</a>
            <a href="#download">下载</a>
            <a href="/app">网页版</a>
            <a href="/wenshu">墨童·文书</a>
          </div>
          <a className={`${s.btn} ${s.btnPrimary} ${s.navCta}`} href="/app">立即在线使用</a>
        </div>
      </nav>

      {/* Hero */}
      <header className={`${s.wrap} ${s.hero}`}>
        <span className={s.badge}><IcSparkles size={14} /> 对话即创作的 AI 生图工作台</span>
        <h1 className={s.heroTitle}>
          想到即所见<br /><span className={s.grad}>用一句话，生成一张图</span>
        </h1>
        <p className={s.heroSub}>
          Co-GPT 让你像聊天一样生成与编辑图片——对话生图、局部重绘、参考图、矢量化、高清放大。
          密钥云端托管，安全省心，开箱即用。
        </p>
        <div className={s.heroCta}>
          <a className={`${s.btn} ${s.btnPrimary}`} href="/app"><IcGlobe size={16} /> 立即在线使用 <span style={{ opacity: 0.85, fontWeight: 400 }}>· 网页版免下载</span></a>
          <DownloadBtn url={winUrl} label="下载 Windows 版" sub="Win 10/11" />
          <DownloadBtn url={macUrl} label="下载 macOS 版" sub="Apple 芯片 / Intel" />
          <a className={`${s.btn} ${s.btnGhost}`} href="#download"><IcPhone size={16} /> 手机版（安卓 / iPhone）</a>
        </div>
        <p className={s.heroNote}>
          下载安装即用 · <b style={{ color: '#fff' }}>无需翻墙</b> · <b style={{ color: '#fff' }}>无需 GPT 账号或邮箱</b> · <b style={{ color: '#fff' }}>无需 API Key</b> · 手机号一键登录
        </p>

        <div className={s.trust}>
          <div className={s.trustItem}><b><IcZap size={15} /> 下载即用</b><span>安装打开即可创作</span></div>
          <div className={s.trustItem}><b><IcGlobe size={15} /> 无需翻墙</b><span>国内直连，秒开秒用</span></div>
          <div className={s.trustItem}><b><IcPhone size={15} /> 手机号登录</b><span>无需 GPT 账号 / 邮箱</span></div>
          <div className={s.trustItem}><b><IcCheck size={15} /> 失败不扣次</b><span>只为成功的图买单</span></div>
        </div>
      </header>

      {/* 作品画廊 */}
      <section id="gallery" className={`${s.wrap} ${s.section}`}>
        <span className={s.kicker}>Showcase</span>
        <h2 className={s.h2}>AI 生图效果展示</h2>
        <p className={s.subtle}>以下作品均由 Co-GPT 生成。从产品渲染到人像、海报、概念场景，一句话即可创作。</p>
        <div className={s.gallery} style={{ marginTop: 34 }}>
          {shots.map((f) => (
            <div key={f} className={s.shot}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/showcase/${f}.webp`} alt="Co-GPT 生成作品" loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      {/* 功能 */}
      <section id="features" className={`${s.wrap} ${s.section}`}>
        <span className={s.kicker}>Features</span>
        <h2 className={s.h2}>为创作而生的工具箱</h2>
        <div className={s.features}>
          {FEATURES.map((f) => (
            <div key={f.t} className={s.fcard}>
              <div className={s.ficon}>{f.icon}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 价格 */}
      <section id="pricing" className={`${s.wrap} ${s.section}`}>
        <span className={s.kicker}>Pricing</span>
        <h2 className={s.h2}>按月会员，额度透明</h2>
        <p className={s.subtle}>所有套餐统一使用云端模型，按月开通、到期失效。生图失败不消耗次数。</p>
        <div className={s.tiers}>
          {tiers.map((t) => (
            <div key={t.id} className={`${s.tier} ${t.id === 'plus' ? s.tierHot : ''}`}>
              {t.id === 'plus' && <span className={s.tierTag}>最受欢迎</span>}
              <div className={s.tierName}>{t.name}</div>
              <div className={s.price}>¥{t.priceCents / 100}<small> /月</small></div>
              <div className={s.tierQuota}>每月 {t.quota} 次生图</div>
              <ul className={s.tierList}>
                <li>高质量 GPT 生图模型</li>
                <li>9:16 等任意比例 · 局部重绘 / 参考图</li>
                <li>多对话历史记录（保存 / 回看）</li>
                <li>本地矢量化 & 高清放大 · 失败不扣次</li>
              </ul>
            </div>
          ))}
        </div>
        <p className={s.freeNote}>新用户注册即享每日免费生图额度，先体验再决定是否开通会员。</p>
      </section>

      {/* 下载 */}
      <section id="download" className={`${s.wrap} ${s.section} ${s.download}`}>
        <span className={s.kicker}>Download</span>
        <h2 className={s.h2}>立即开始创作</h2>
        <DownloadGuide />
        <div className={s.dlCard}>
          <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 10 }}>电脑版</div>
          <div className={s.dlBtns}>
            <DownloadBtn url={winUrl} label="下载 Windows 版" sub="Win 10/11" />
            <DownloadBtn url={macUrl} label="下载 macOS 版" sub="Apple / Intel" />
          </div>
          <div style={{ height: 22, borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 22 }} />
          <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 6 }}>手机版（安卓 / iPhone）</div>
          <p className={s.dlHint} style={{ marginTop: 0, marginBottom: 12 }}>
            <IcPhone size={15} /> 仅 <b>安卓</b>设备可直接下载客户端；<b>苹果 iPhone / iPad 无客户端</b>，请使用「手机网页版」（可添加到主屏幕像 App 一样用）。
          </p>
          <div className={s.dlBtns}>
            <DownloadBtn url={androidUrl} label="下载安卓 APK" sub="Android" />
            <a className={`${s.btn} ${s.btnGhost}`} href="/app">打开手机网页版（iPhone 用这个）</a>
            <a className={`${s.btn} ${s.btnGhost}`} href="/download">查看全部下载 →</a>
          </div>
          <p className={s.dlMeta}>当前版本 v{version} · {mirrorNote}</p>
          <p className={s.dlHint}>
            iPhone：用 Safari 打开本站 →「分享」→「添加到主屏幕」；macOS 首次打开如提示「无法验证开发者」，请在图标上 <b>右键 → 打开</b>。
          </p>
        </div>
      </section>

      {/* 页脚 */}
      <footer className={s.footer}>
        <div className={s.wrap}>
          <div className={s.footCols}>
            <div>
              <div className={s.brand} style={{ marginBottom: 10 }}><Logo gradId="footLogo" /> Co-GPT</div>
              <p>对话即创作的 AI 生图工作台。</p>
            </div>
            <div>
              <h4>产品</h4>
              <a href="#features">功能</a>
              <a href="#gallery">作品展示</a>
              <a href="#pricing">价格</a>
            </div>
            <div>
              <h4>下载</h4>
              <a href="#download">Windows 版</a>
              <a href="#download">macOS 版</a>
              <a href="#download">安卓版 APK</a>
              <a href="/app">手机网页版</a>
            </div>
            <div>
              <h4>法律</h4>
              <a href="/terms">用户协议</a>
              <a href="/privacy">隐私政策</a>
            </div>
          </div>
          <p className={s.copyright}>© 2026 Co-GPT · All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
