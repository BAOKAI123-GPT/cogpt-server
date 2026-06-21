'use client'
import { useEffect } from 'react'

// 官网动效增强（渐进增强）：无 JS / 关闭动效偏好时，页面完全正常显示，不隐藏任何内容。
// 1) 滚动揭示：[data-reveal] 进入视口时加 .is-in 触发淡入上浮。
// 2) 光标聚光：[data-spotlight] 卡片跟随鼠标位置更新 --mx/--my，配合 CSS 径向高光。
export function Motion(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // 标记：只有 JS 就绪后才启用"先隐藏后揭示"，避免无 JS 时内容被永久隐藏。
    document.documentElement.classList.add('motion-on')

    const reveal = Array.from(document.querySelectorAll('[data-reveal]'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute('data-reveal', 'in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    reveal.forEach((el) => io.observe(el))

    let raf = 0
    const onMove = (ev: PointerEvent): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const t = (ev.target as HTMLElement | null)?.closest('[data-spotlight]') as HTMLElement | null
        if (!t) return
        const r = t.getBoundingClientRect()
        t.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width) * 100}%`)
        t.style.setProperty('--my', `${((ev.clientY - r.top) / r.height) * 100}%`)
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return null
}
