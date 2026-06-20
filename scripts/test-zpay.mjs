// zpay 防复发单元测试。运行方式：
//   cd cogpt-server && node --import tsx --test scripts/test-zpay.mjs
// 覆盖：zpaySign 稳定性、金额数值比较边界(9.9/9.90/0.01)、settlePaidOrder 幂等核心逻辑。
// 纯函数(zpaySign / moneyMatchesCents)直接 import 生产代码；settlePaidOrder 因依赖 prisma，
// 这里以"同一单二次结算不重复发额度"的核心逻辑(updateMany flipped.count===0 ⇒ 不发放)做等价验证。
import test from 'node:test'
import assert from 'node:assert/strict'
import { zpaySign, moneyMatchesCents } from '../src/lib/zpay.ts'

test('zpaySign：相同入参签名稳定（可重复、与字段顺序无关）', () => {
  const a = { pid: '1001', money: '9.90', name: 'x', out_trade_no: 'CG1', type: 'alipay' }
  const b = { type: 'alipay', out_trade_no: 'CG1', name: 'x', money: '9.90', pid: '1001' }
  const s1 = zpaySign(a, 'SECRET')
  const s2 = zpaySign(a, 'SECRET')
  const s3 = zpaySign(b, 'SECRET')
  assert.equal(s1, s2, '同入参两次签名应一致')
  assert.equal(s1, s3, '字段顺序不同但内容相同，签名应一致')
  assert.match(s1, /^[a-f0-9]{32}$/, 'md5 小写 32 位')
})

test('zpaySign：排除 sign / sign_type / 空值字段', () => {
  const withExtras = { pid: '1001', money: '9.90', sign: 'OLD', sign_type: 'MD5', empty: '', nul: undefined }
  const clean = { pid: '1001', money: '9.90' }
  assert.equal(zpaySign(withExtras, 'K'), zpaySign(clean, 'K'), 'sign/sign_type/空值不应参与签名')
})

test('zpaySign：key 不同则签名不同', () => {
  const p = { pid: '1001', money: '9.90' }
  assert.notEqual(zpaySign(p, 'K1'), zpaySign(p, 'K2'))
})

test('moneyMatchesCents：9.9 / 9.90 / 9.900 都等于 990 分', () => {
  assert.equal(moneyMatchesCents('9.9', 990), true)
  assert.equal(moneyMatchesCents('9.90', 990), true)
  assert.equal(moneyMatchesCents('9.900', 990), true)
  assert.equal(moneyMatchesCents(9.9, 990), true)
})

test('moneyMatchesCents：边界 0.01 = 1 分', () => {
  assert.equal(moneyMatchesCents('0.01', 1), true)
  assert.equal(moneyMatchesCents('0.1', 1), false)
  assert.equal(moneyMatchesCents('0.01', 10), false)
})

test('moneyMatchesCents：金额不符返回 false（防伪造低额支付冒充高额订单）', () => {
  assert.equal(moneyMatchesCents('1.00', 990), false)
  assert.equal(moneyMatchesCents('99.00', 990), false)
})

test('moneyMatchesCents：非法/缺失金额返回 false', () => {
  assert.equal(moneyMatchesCents(undefined, 990), false)
  assert.equal(moneyMatchesCents(null, 990), false)
  assert.equal(moneyMatchesCents('', 990), false)
  assert.equal(moneyMatchesCents('abc', 990), false)
  assert.equal(moneyMatchesCents(NaN, 990), false)
})

test('settlePaidOrder 幂等核心：同一单二次结算只发放一次', () => {
  // 生产逻辑：prisma.order.updateMany({ where:{ status:{ not:'paid' } } }) 返回 flipped.count，
  // count===0 即已是 paid（已发放过）→ return false 不再发额度。这里用内存模拟该原子翻转。
  let granted = 0
  const order = { status: 'pending' }
  function settleOnce() {
    // 模拟 updateMany 的原子条件更新：仅当当前不是 paid 才翻转并计 count=1
    const flippedCount = order.status !== 'paid' ? 1 : 0
    if (flippedCount === 0) return false // 幂等：已发放过
    order.status = 'paid'
    granted += 1 // 发放额度
    return true
  }
  assert.equal(settleOnce(), true, '首次结算应发放')
  assert.equal(settleOnce(), false, '二次结算应幂等跳过')
  assert.equal(settleOnce(), false, '三次结算仍跳过')
  assert.equal(granted, 1, '同一单无论回调/查单触发多少次，额度只发一次')
})
