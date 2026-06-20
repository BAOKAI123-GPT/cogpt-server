import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/admin'
import { getAllConfig, setConfig } from '@/lib/config'

// 读取全部配置（含中转站、套餐、可用模型、短信开关等）
export async function GET(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  return NextResponse.json({ config: await getAllConfig() })
}

// 批量保存配置
export async function POST(req: Request): Promise<Response> {
  if (!(await currentAdmin(req))) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const patch = body?.config
  if (!patch || typeof patch !== 'object') {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }
  // 防呆：中转站地址必须是 http(s) 链接。浏览器密码管理器常把后台账号/密码自动填进
  // 这两个相邻输入框（地址=用户名、Key=密码），导致正确配置被覆盖。这里直接拦下整批保存。
  const bu = patch.relay_base_url
  if (typeof bu === 'string' && bu.trim() && !/^https?:\/\//i.test(bu.trim())) {
    return NextResponse.json(
      { error: '中转站地址必须以 http:// 或 https:// 开头，已拒绝保存（疑似被浏览器自动填充覆盖，请检查地址与 Key 是否被改成了登录账号密码）' },
      { status: 400 }
    )
  }
  for (const [k, v] of Object.entries(patch)) {
    await setConfig(k, String(v))
  }
  return NextResponse.json({ ok: true, config: await getAllConfig() })
}
