import Dypnsapi, {
  SendSmsVerifyCodeRequest,
  CheckSmsVerifyCodeRequest
} from '@alicloud/dypnsapi20170525'
import * as OpenApi from '@alicloud/openapi-client'
import { prisma } from './db'
import { getConfig } from './config'

// 阿里云 PNVS（dypnsapi）短信验证码：发码与校验都在云端，本地仅做 60s 频控。
// 见 docs/阿里云短信验证码接入手册。
function createClient(): Dypnsapi {
  const config = new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET
  })
  config.endpoint = 'dypnsapi.aliyuncs.com'
  return new Dypnsapi(config)
}

async function sendSmsVerify(phone: string): Promise<{ ok: boolean; error?: string }> {
  const id = process.env.ALIYUN_SMS_ACCESS_KEY_ID
  const secret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET
  const sign = (await getConfig('sms_sign_name')).trim()
  const tpl = (await getConfig('sms_template_code')).trim()
  if (!id || !secret || !sign || !tpl) return { ok: false, error: '短信未配置' }
  try {
    const client = createClient()
    const req = new SendSmsVerifyCodeRequest({
      phoneNumber: phone,
      signName: sign,
      templateCode: tpl,
      templateParam: JSON.stringify({ code: '##code##', min: '5' }),
      codeLength: 6,
      codeType: 1,
      validTime: 300
    })
    const res = await client.sendSmsVerifyCode(req)
    if (res.body?.code === 'OK') return { ok: true }
    return { ok: false, error: res.body?.message || res.body?.code || '发送失败' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

async function checkSmsVerify(phone: string, code: string): Promise<boolean> {
  try {
    const client = createClient()
    const req = new CheckSmsVerifyCodeRequest({ phoneNumber: phone, verifyCode: code })
    const res = await client.checkSmsVerifyCode(req)
    return res.body?.model?.verifyResult === 'PASS'
  } catch {
    return false
  }
}

/** 发码（同号 60 秒频控 + 单 IP 每小时上限 + 全站每日上限，防短信被刷爆） */
export async function issueCode(phone: string, ip?: string): Promise<{ ok: boolean; error?: string }> {
  if ((await getConfig('sms_enabled')) !== '1') return { ok: true } // 关闭=调试直接放行

  // ① 同号 60 秒频控
  const since60 = new Date(Date.now() - 60_000)
  const recent = await prisma.smsCode.findFirst({
    where: { phone, createdAt: { gte: since60 } },
    orderBy: { createdAt: 'desc' }
  })
  if (recent) return { ok: false, error: '请稍后再试（60 秒内只能发一次）' }

  // ② 单 IP 每小时上限
  const ipCap = Number(await getConfig('sms_ip_hourly_cap')) || 0
  if (ipCap > 0 && ip) {
    const sinceHour = new Date(Date.now() - 3600_000)
    const ipCount = await prisma.smsCode.count({ where: { ip, createdAt: { gte: sinceHour } } })
    if (ipCount >= ipCap) return { ok: false, error: '操作过于频繁，请稍后再试' }
  }

  // ③ 全站每日上限（保护短信余额）
  const dailyCap = Number(await getConfig('sms_daily_cap')) || 0
  if (dailyCap > 0) {
    const sinceDay = new Date(Date.now() - 24 * 3600_000)
    const dayCount = await prisma.smsCode.count({ where: { createdAt: { gte: sinceDay } } })
    if (dayCount >= dailyCap) return { ok: false, error: '今日验证码发送已达上限，请稍后再试' }
  }

  await prisma.smsCode.create({ data: { phone, ip: ip ?? null } })
  return await sendSmsVerify(phone)
}

/** 校验验证码 */
export async function checkCode(phone: string, code: string): Promise<boolean> {
  if ((await getConfig('sms_enabled')) !== '1') return true // 关闭=调试直接通过
  return await checkSmsVerify(phone, code)
}
