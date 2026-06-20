import type { ReactNode } from 'react'
import s from '../wenshu.module.css'
import { getConfig } from '@/lib/config'
import { IcDownload, IcAlert } from '../../icons'

export const metadata = { title: '墨童 · 下载' }
export const dynamic = 'force-dynamic'

function Btn({ url, label, sub }: { url: string; label: string; sub: string }) {
  if (!url) return <span className={`${s.btn} ${s.btnDisabled}`}>{label} · 敬请期待</span>
  return (
    <a className={`${s.btn} ${s.btnPrimary}`} href={url}>
      <IcDownload size={16} /> {label} <span style={{ opacity: 0.85, fontWeight: 400 }}>· {sub}</span>
    </a>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--red)',
          color: '#2a1d05',
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          fontWeight: 700
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: '#5a4f3d' }}>
        <b style={{ color: '#2a2620' }}>{title}</b>
        <br />
        {children}
      </div>
    </div>
  )
}

export default async function WenshuDownload() {
  const winUrl = await getConfig('ws_download_win_url')
  const macUrl = await getConfig('ws_download_mac_url')
  const macIntelUrl = await getConfig('ws_download_mac_intel_url')
  const androidUrl = await getConfig('ws_download_android_url')
  const version = await getConfig('ws_app_version')
  const mirrorNote = await getConfig('ws_download_mirror_note')

  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <div className={s.navInner}>
          <a className={s.brand} href="/wenshu">
            <span className={s.logo}>墨</span> 墨童
          </a>
          <div className={s.navSpacer} />
          <a className={`${s.btn} ${s.btnGhost}`} href="/wenshu" style={{ padding: '8px 18px' }}>
            返回首页
          </a>
        </div>
      </nav>

      <header className={`${s.wrap} ${s.hero}`} style={{ paddingBottom: 18 }}>
        <span className={s.badge}>下载 · v{version}</span>
        <h1 className={s.title} style={{ fontSize: 44 }}>
          下载 <span className={s.titleRed}>墨童</span>
        </h1>
        <p className={s.sub}>{mirrorNote} · 安装后用手机号登录即可开始。</p>
      </header>

      <section className={`${s.wrap}`} style={{ paddingBottom: 60 }}>
        <div className={s.dlCard} style={{ borderColor: 'var(--red)', background: 'var(--red-soft)' }}>
          <h2 className={s.cardT} style={{ fontSize: 20 }}><IcDownload size={19} /> 下载安装三步走（首次必看）</h2>
          <p className={s.dlHint} style={{ marginTop: 4, marginBottom: 18, color: '#555' }}>
            本软件暂未购买付费签名证书，下载和首次打开时浏览器 / 系统会例行提示——
            <b style={{ color: 'var(--red)' }}>这是正常的，文件安全无害</b>，按下面点两下就能装好。
          </p>
          <Step n={1} title="浏览器下载时，若提示「通常不会下载该文件 / 可能有害」">
            Chrome：点下载栏里该文件右侧的 <b>⋯ →「保留」</b>；Edge：点提示里的{' '}
            <b>⋯ →「保留」→「仍然保留」</b>。
          </Step>
          <Step n={2} title="双击安装时，Windows 弹蓝色窗「已保护你的电脑」">
            点窗口左下的蓝字 <b>「更多信息」→「仍要运行」</b> 即可正常安装。
            <br />
            （Mac 用户：在图标上 <b>右键 / Control+点按 →「打开」→ 再点「打开」</b>）
          </Step>
          <Step n={3} title="装好后打开墨童，用手机号收验证码登录即可开始">
            你的文件全程在自己电脑上处理，安全放心。
          </Step>
        </div>

        <div className={s.dlCard}>
          <h2 className={s.cardT} style={{ fontSize: 20 }}>Windows</h2>
          <p className={s.dlHint} style={{ marginTop: 4, marginBottom: 14 }}>适用于 Windows 10 / 11（64 位）。</p>
          <div className={s.dlBtns}>
            <Btn url={winUrl} label="下载 Windows 安装包" sub=".exe" />
          </div>
          <p className={s.dlHint}>
            <IcAlert size={14} /> 打开时若提示「Windows 已保护你的电脑 / 未知发布者」属正常（暂未做付费签名）：点
            <b>「更多信息」→「仍要运行」</b>即可，安全无害。
          </p>
        </div>

        <div className={s.dlCard}>
          <h2 className={s.cardT} style={{ fontSize: 20 }}>macOS</h2>
          <p className={s.dlHint} style={{ marginTop: 4, marginBottom: 14 }}>
            按芯片选择：关于本机 →「芯片」含 Apple M 系列选左，Intel 选右。
          </p>
          <div className={s.dlBtns}>
            <Btn url={macUrl} label="Apple 芯片 (M1/M2/M3…)" sub="arm64 .dmg" />
            <Btn url={macIntelUrl} label="Intel 芯片" sub="x64 .dmg" />
          </div>
          <p className={s.dlHint}>
            <IcAlert size={14} /> 首次打开提示「已损坏 / 无法验证开发者」属正常：在应用图标上
            <b> Control + 点按 →「打开」→ 再「打开」</b>即可。
          </p>
        </div>

        <div className={s.dlCard}>
          <h2 className={s.cardT} style={{ fontSize: 20 }}>手机版</h2>
          <p className={s.dlHint} style={{ marginTop: 4, marginBottom: 14 }}>
            安卓可直接安装 APK；iPhone 用网页版（Safari「添加到主屏幕」）。
          </p>
          <div className={s.dlBtns}>
            <Btn url={androidUrl} label="下载安卓 APK" sub=".apk" />
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        © 2026 墨童 · <a href="/wenshu">首页</a> · <a href="/terms">用户协议</a> ·{' '}
        <a href="/privacy">隐私政策</a>
      </footer>
    </div>
  )
}
