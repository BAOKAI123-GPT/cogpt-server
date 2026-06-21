'use client'
import { useEffect, useState } from 'react'
import s from './page.module.css'

// 客服微信：紧凑展示在页脚品牌列里（不再单独占一行）；二维码保持原比例不拉伸；点击放大查看。
export function WechatContact() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className={s.contact}>
      <h4>遇到问题，联系客服</h4>
      <button type="button" className={s.qrThumb} onClick={() => setOpen(true)} aria-label="点击放大客服微信二维码">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wechat-qr.jpg" alt="客服微信二维码" />
        <span className={s.qrZoom}>点击放大</span>
      </button>
      <p className={s.contactWx}>微信号：<b>b0207123k</b></p>

      {open && (
        <div className={s.qrMask} onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="客服微信二维码">
          <div className={s.qrBox} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wechat-qr.jpg" alt="客服微信二维码" />
            <button type="button" className={s.qrClose} onClick={() => setOpen(false)}>关闭 ✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
