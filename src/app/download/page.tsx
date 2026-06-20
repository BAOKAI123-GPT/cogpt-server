import s from '../page.module.css'
import { Logo } from '../Logo'
import { getConfig } from '@/lib/config'
import { DownloadGuide } from '../DownloadGuide'

export const metadata = { title: 'Co-GPT · 下载客户端' }
export const dynamic = 'force-dynamic'

function Btn({ url, label, sub }: { url: string; label: string; sub: string }) {
  if (!url) return <span className={`${s.btn} ${s.btnDisabled}`}>{label} · 敬请期待</span>
  return (
    <a className={`${s.btn} ${s.btnPrimary}`} href={url}>
      ⬇ {label} <span style={{ opacity: 0.8, fontWeight: 400 }}>· {sub}</span>
    </a>
  )
}

export default async function Download() {
  const winUrl = await getConfig('download_win_url')
  const macUrl = await getConfig('download_mac_url')
  const macIntelUrl = await getConfig('download_mac_intel_url')
  const androidUrl = await getConfig('download_android_url')
  const version = await getConfig('app_version')
  const mirrorNote = await getConfig('download_mirror_note')

  return (
    <div className={s.page}>
      <div className={s.glows}>
        <div className={`${s.glow} ${s.glow1}`} />
        <div className={`${s.glow} ${s.glow3}`} />
      </div>
      <nav className={s.nav}>
        <div className={s.navInner}>
          <a className={s.brand} href="/"><Logo gradId="dlLogo" /> Co-GPT</a>
          <a className={`${s.btn} ${s.btnGhost} ${s.navCta}`} href="/">返回首页</a>
        </div>
      </nav>

      <header className={`${s.wrap} ${s.hero}`} style={{ paddingBottom: 10 }}>
        <span className={s.badge}>Download · v{version}</span>
        <h1 className={s.heroTitle}><span className={s.grad}>下载 Co-GPT 客户端</span></h1>
        <p className={s.heroSub}>{mirrorNote} · 安装后用手机号登录即可开始创作。</p>
      </header>

      <section className={`${s.wrap} ${s.section} ${s.download}`} style={{ paddingTop: 20 }}>
        <DownloadGuide />
        <div className={s.dlCard}>
          <h2 className={s.h2} style={{ fontSize: 22 }}>Windows</h2>
          <p className={s.subtle} style={{ margin: '6px auto 14px' }}>适用于 Windows 10 / 11（64 位）。</p>
          <div className={s.dlBtns}><Btn url={winUrl} label="下载 Windows 安装包" sub=".exe" /></div>
          <p className={s.dlHint} style={{ marginTop: 16 }}>
            ⚠️ 下载或打开时若出现「Windows 已保护你的电脑 / 未知发布者」提示，属正常现象（安装包暂未做付费数字签名）。
            处理：点提示框里的 <b>「更多信息」</b> → <b>「仍要运行」</b> 即可正常安装使用，安全无害。
          </p>
        </div>

        <div className={s.dlCard} style={{ marginTop: 20 }}>
          <h2 className={s.h2} style={{ fontSize: 22 }}>macOS</h2>
          <p className={s.subtle} style={{ margin: '6px auto 14px' }}>请按你的芯片选择：关于本机 →「芯片/处理器」含 Apple M 系列选左侧，Intel 选右侧。</p>
          <div className={s.dlBtns}>
            <Btn url={macUrl} label="Apple 芯片 (M1/M2/M3…)" sub="arm64 .dmg" />
            <Btn url={macIntelUrl} label="Intel 芯片" sub="x64 .dmg" />
          </div>
          <p className={s.dlHint} style={{ marginTop: 16 }}>
            ⚠️ macOS 首次打开提示「已损坏 / 无法验证开发者」时，属正常现象（应用未做苹果付费签名）。
            解决：在应用图标上 <b>按住 Control 点按 → 选「打开」 → 再点「打开」</b>，之后即可正常使用。
          </p>
        </div>

        <div className={s.dlCard} style={{ marginTop: 20 }}>
          <h2 className={s.h2} style={{ fontSize: 22 }}>手机版（安卓 / iPhone）</h2>
          <p className={s.subtle} style={{ margin: '6px auto 14px' }}>
            ⚠️ 仅 <b style={{ color: '#fff' }}>安卓</b>设备可直接下载客户端安装；<b style={{ color: '#fff' }}>苹果 iPhone / iPad 没有客户端</b>，只能使用「手机网页版」（Safari 打开并「添加到主屏幕」即可像 App 一样使用）。
          </p>
          <div className={s.dlBtns}>
            <Btn url={androidUrl} label="下载安卓 APK" sub=".apk" />
            <a className={`${s.btn} ${s.btnGhost}`} href="/app" style={{ textDecoration: 'none' }}>
              打开手机网页版
            </a>
          </div>
          <p className={s.dlHint} style={{ marginTop: 16 }}>
            安卓：安装 APK 时若提示「未知来源 / 来自此来源的应用」，允许安装即可。<br />
            iPhone：用 Safari 打开本站 → 底部「分享」→「添加到主屏幕」。
          </p>
        </div>

        <p className={s.dlMeta} style={{ marginTop: 24 }}>
          下载较慢？可在浏览器多试几次，或稍后再试（已接入国内镜像加速）。
        </p>
      </section>

      <footer className={s.footer}>
        <div className={s.wrap}>
          <p className={s.copyright}>
            © 2026 Co-GPT · <a href="/terms" style={{ color: 'inherit' }}>用户协议</a> · <a href="/privacy" style={{ color: 'inherit' }}>隐私政策</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
