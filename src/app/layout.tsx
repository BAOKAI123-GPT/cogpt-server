import type { ReactNode } from 'react'

export const metadata = {
  title: 'Co-GPT · 对话即创作的 AI 生图工作台',
  description: 'Co-GPT 让你像聊天一样生成与编辑图片：对话生图、局部重绘、参考图、矢量化与高清放大。Windows / macOS 客户端免费下载。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Co-GPT', statusBarStyle: 'black-translucent' as const },
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' }
}

export const viewport = {
  themeColor: '#0b0814',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#16131f', color: '#e9e8f0' }}>
        {children}
      </body>
    </html>
  )
}
