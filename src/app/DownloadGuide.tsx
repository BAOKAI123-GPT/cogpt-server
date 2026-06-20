// 下载前必看的三步（框起来），Co-GPT 紫黑主题。首页 #download 与 /download 复用。
import type { ReactNode } from 'react'
import { IcDownload } from './icons'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 13 }}>
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'linear-gradient(120deg, var(--brand), var(--brand2))',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          fontWeight: 700
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted)', textAlign: 'left' }}>
        <b style={{ color: '#fff' }}>{title}</b>
        <br />
        {children}
      </div>
    </div>
  )
}

export function DownloadGuide() {
  return (
    <div
      style={{
        border: '1px solid rgba(139,92,255,0.5)',
        background: 'rgba(139,92,255,0.10)',
        borderRadius: 18,
        padding: '24px 26px',
        margin: '0 auto 22px',
        maxWidth: 680
      }}
    >
      <h3 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
        <IcDownload size={20} /> 下载安装三步走（首次必看）
      </h3>
      <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.6, textAlign: 'left' }}>
        本软件暂未购买付费签名证书，下载和首次打开时浏览器 / 系统会例行提示——
        <b style={{ color: '#cdbcff' }}>这是正常的，文件安全无害</b>，按下面点两下就能装好。
      </p>
      <Step n={1} title="浏览器下载时，若提示「通常不会下载该文件 / 可能有害」">
        Chrome：点下载栏该文件右侧 <b>⋯ →「保留」</b>；Edge：点提示里的 <b>⋯ →「保留」→「仍然保留」</b>。
      </Step>
      <Step n={2} title="双击安装时，Windows 弹蓝色窗「已保护你的电脑」">
        点窗口左下蓝字 <b>「更多信息」→「仍要运行」</b> 即可安装。
        <br />
        （Mac：在图标上 <b>右键 / Control + 点按 →「打开」→ 再点「打开」</b>）
      </Step>
      <Step n={3} title="装好后打开 Co-GPT，用手机号收验证码登录即可开始创作">
        生图全部云端完成，安全可靠。
      </Step>
    </div>
  )
}
