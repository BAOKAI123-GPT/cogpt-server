'use client'
import { useEffect, useRef } from 'react'
import s from './page.module.css'

// 首屏互动方块阵列：铺满英雄区作为背景，点击任意处会以点击点为中心、向四周「波浪扩散」点亮方块。
// 纯 DOM 网格 + CSS 动画（按到中心的距离给 animation-delay 形成波）。logo/定位文案浮在其上。
// 渐进增强：无 JS / reduced-motion 时不渲染网格，不影响页面。
export function TileField() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const TILE = 46 // 方块边长(px)
    let cols = 0
    let tiles: HTMLDivElement[] = []

    const build = (): void => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      cols = Math.max(1, Math.ceil(w / TILE))
      const rows = Math.max(1, Math.ceil(h / TILE))
      host.style.setProperty('--cols', String(cols))
      const frag = document.createDocumentFragment()
      tiles = []
      for (let i = 0; i < cols * rows; i++) {
        const d = document.createElement('div')
        d.className = s.tile
        tiles.push(d)
        frag.appendChild(d)
      }
      host.replaceChildren(frag)
    }

    const ripple = (cx: number, cy: number): void => {
      for (let i = 0; i < tiles.length; i++) {
        const x = i % cols
        const y = Math.floor(i / cols)
        const dist = Math.hypot(x - cx, y - cy)
        const t = tiles[i]
        t.style.setProperty('--d', `${Math.round(dist * 40)}ms`)
        t.classList.remove(s.on)
        // 强制重排以便重新触发动画
        void t.offsetWidth
        t.classList.add(s.on)
      }
    }

    const onPointer = (e: PointerEvent): void => {
      const r = host.getBoundingClientRect()
      const cx = Math.floor((e.clientX - r.left) / TILE)
      const cy = Math.floor((e.clientY - r.top) / TILE)
      ripple(cx, cy)
    }

    build()
    host.addEventListener('pointerdown', onPointer)
    let t: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(build, 200)
    })
    ro.observe(host)

    // 环境光效：每隔几秒从随机点自动扩散一次，让阵列「呼吸」并暗示可点击。仅页面可见时触发。
    const ambient = setInterval(() => {
      if (document.hidden || !tiles.length || !cols) return
      const rows = Math.ceil(tiles.length / cols)
      ripple(Math.floor(Math.random() * cols), Math.floor(Math.random() * rows))
    }, 5200)

    return () => {
      host.removeEventListener('pointerdown', onPointer)
      ro.disconnect()
      clearInterval(ambient)
      if (t) clearTimeout(t)
    }
  }, [])

  return <div ref={ref} className={s.tilefield} aria-hidden="true" />
}
