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
  let labels: Record<string, string> = {}
  try {
    labels = JSON.parse((await getConfig('model_labels')) || '{}')
  } catch {
    labels = {}
  }
  const meta: Record<string, { mode: string; credits: number; ref: boolean; label: string }> = {}
  for (const m of models) {
    meta[m] = {
      mode: mode[m] === 'standard' ? 'standard' : 'quality',
      credits: Number(credits[m]) > 0 ? Number(credits[m]) : 10,
      ref: await modelRefSupported(m),
      label: typeof labels[m] === 'string' && labels[m] ? labels[m] : m
    }
  }
  // 定价规则（点数制）：客户端据此显示预估扣点（多参考图/高清加价）。扣费仍以服务端为准。
  let hdSurcharge: Record<string, number> = {}
  try {
    hdSurcharge = JSON.parse((await getConfig('hd_surcharge')) || '{}')
  } catch {
    hdSurcharge = {}
  }
  const pricing = {
    refExtraPoints: Number(await getConfig('ref_extra_points')) || 0,
    hdSurcharge // { 长边阈值: 加点 }
  }
  return NextResponse.json({ models, meta, pricing })
}
