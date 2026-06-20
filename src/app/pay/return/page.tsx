export default function PayReturn() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100vh', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 24 }}>支付完成</h1>
        <p style={{ opacity: 0.75 }}>到账后会员额度会自动发放，请返回 cogpt 应用查看额度。</p>
      </div>
    </main>
  )
}
