import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { modelRefSupported } from '@/lib/relay'

// 返回可用生图模型 + 每个模型的元信息（模式 standard/quality、扣额度、是否支持参考图），
// 前端据此做「标准/高质量」两档 UI、额度提示与参考图入口显隐。
export async function GET(): Promise<Response> {
  let models: string[] = []
  let mode: Record<string, string> = {}
  let credits: Record<string, number> = {}
  try {
    models = JSON.parse(await getConfig('allowed_models'))
  } catch {
    models = []
  }
  try {
    mode = JSON.parse((await getConfig('model_mode')) || '{}')
  } catch {
    mode = {}
  }
  try {
    credits = JSON.parse((await getConfig('model_credits')) || '{}')
  } catch {
    credits = {}
  }
  const meta: Record<string, { mode: string; credits: number; ref: boolean }> = {}
  for (const m of models) {
    meta[m] = {
      mode: mode[m] === 'standard' ? 'standard' : 'quality',
      credits: Number(credits[m]) > 0 ? Number(credits[m]) : 1,
      ref: await modelRefSupported(m)
    }
  }
  return NextResponse.json({ models, meta })
}
