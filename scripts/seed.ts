import { prisma } from '../src/lib/db'
import { hashPassword, genTotpSecret, totpKeyuri } from '../src/lib/admin'

// 初始化管理员账号（密码 + 2FA TOTP）。重复运行不会重置已存在的管理员。
async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || 'cogpt-admin-please-change'

  let admin = await prisma.admin.findUnique({ where: { username } })
  if (!admin) {
    const totpSecret = genTotpSecret()
    admin = await prisma.admin.create({
      data: { username, passwordHash: hashPassword(password), totpSecret }
    })
    console.log(`[seed] 已创建管理员：${username}`)
  } else {
    console.log(`[seed] 管理员已存在：${username}`)
  }
  console.log('======================================================')
  console.log('管理员用户名 :', username)
  console.log('2FA 密钥(base32):', admin.totpSecret)
  console.log('otpauth(可生成二维码):', totpKeyuri(username, admin.totpSecret))
  console.log('======================================================')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
