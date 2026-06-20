// Co-GPT 品牌 logo（与桌面客户端图标一致：渐变圆角方 + 火花 ✦）。
export function Logo({ size = 30, gradId = 'coLogoGrad' }: { size?: number; gradId?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Co-GPT" role="img">
      <defs>
        <linearGradient id={gradId} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b7bff" />
          <stop offset="0.55" stopColor="#7b5cff" />
          <stop offset="1" stopColor="#16a5c9" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${gradId})`} />
      {/* 大火花 */}
      <path d="M17 4.5 Q17 14 26.5 14 Q17 14 17 23.5 Q17 14 7.5 14 Q17 14 17 4.5 Z" fill="#fff" />
      {/* 小火花 */}
      <path d="M9.5 19.7 Q9.5 23.5 13.3 23.5 Q9.5 23.5 9.5 27.3 Q9.5 23.5 5.7 23.5 Q9.5 23.5 9.5 19.7 Z" fill="#fff" opacity="0.92" />
    </svg>
  )
}
