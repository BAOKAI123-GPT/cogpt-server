// 站点通用线性图标（内联 SVG，lucide 风格，MIT 可商用免费）。用于替换营销页里的 emoji。
// 服务端组件可直接用；颜色继承 currentColor，尺寸由 size 控制。
import type { CSSProperties } from 'react'

const st = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}
const base: CSSProperties = { display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0 }
type P = { size?: number }

export const IcChat = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></svg>
)
export const IcBrush = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M9.5 14.5 18 6a2.1 2.1 0 0 1 3 3l-8.5 8.5" /><path d="M9.5 14.5a3 3 0 0 0-3 3c0 1-1 2-2.5 2 1-1 1-2 1-3a3 3 0 0 1 4.5-2z" /></svg>
)
export const IcImage = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4-4a2 2 0 0 0-2.8 0L6 19" /></svg>
)
export const IcVector = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><path d="M5 17A12 12 0 0 1 17 7" /></svg>
)
export const IcZoom = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><circle cx="11" cy="11" r="7.5" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></svg>
)
export const IcShield = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z" /><path d="m9 12 2 2 4-4" /></svg>
)
export const IcSparkles = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} fill="currentColor"><path d="M12 3l1.7 4.8L18.5 9.5 13.7 11.2 12 16l-1.7-4.8L5.5 9.5l4.8-1.7z" /></svg>
)
export const IcGlobe = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5a15 15 0 0 1 4 9.5 15 15 0 0 1-4 9.5 15 15 0 0 1-4-9.5 15 15 0 0 1 4-9.5z" /></svg>
)
export const IcPhone = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><rect x="5.5" y="2" width="13" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
)
export const IcZap = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} fill="currentColor"><path d="M13 2 4 13h6l-1 9 9-11h-6z" /></svg>
)
export const IcCheck = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><circle cx="12" cy="12" r="9.5" /><path d="m8.5 12 2.3 2.3L15.5 9.8" /></svg>
)
export const IcDownload = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
)
export const IcBox = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>
)
export const IcFile = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5M9 13h6M9 17h6" /></svg>
)
export const IcContract = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="m9 15 2 2 4-4" /></svg>
)
export const IcMemory = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
)
export const IcLock = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
)
export const IcAlert = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={base} {...st}><path d="M12 3 2 20h20zM12 9v5M12 17h.01" /></svg>
)
