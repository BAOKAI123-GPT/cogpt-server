import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

// 客户端启动时拉取最新版本信息，用于「检测更新 → 引导下载」。公开接口，无需登录。
export async function GET(): Promise<Response> {
  const version = await getConfig('app_version')
  const notes = await getConfig('update_notes')
  const force = (await getConfig('force_update')) === '1'
  return NextResponse.json({
    version,
    url: 'https://cogpt.art/download',
    notes,
    force
  })
}
