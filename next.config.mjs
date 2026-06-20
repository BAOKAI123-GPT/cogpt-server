/** @type {import('next').NextConfig} */
const nextConfig = {
  // 后端只做 API + 管理后台，关闭多余特性
  reactStrictMode: true,
  // sharp 是原生模块，不能被 Next 打包/解析（否则报 Unexpected token 'with'）
  serverExternalPackages: ['sharp'],
  // 生图返回的 base64 可能较大，放宽 body 限制
  experimental: {
    serverActions: { bodySizeLimit: '12mb' }
  }
}
export default nextConfig
