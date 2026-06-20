#!/usr/bin/env bash
# 翰文/CoGPT 后端一键更新部署（在 cogpt.art 所在服务器上运行）。
# 用法：把本项目放到服务器上，cd 进目录，执行：bash deploy.sh
set -e
cd "$(dirname "$0")"

echo "[1/5] 备份数据库（出问题可回滚）"
[ -f prisma/cogpt.db ] && cp prisma/cogpt.db "prisma/cogpt.db.bak-$(date +%s)" && echo "  已备份" || echo "  （无现有库，全新）"

echo "[2/5] 安装依赖"
npm ci 2>/dev/null || npm install

echo "[3/5] 同步数据库结构（新增翰文字段，纯增量、不动旧数据）"
npm run db:push

echo "[4/5] 生产构建"
npm run build

echo "[5/5] 重启服务（端口 3000）"
pkill -f "next-server" 2>/dev/null || true
sleep 2
nohup npm run start > server.log 2>&1 &
sleep 3
echo "完成 ✅  服务已在 127.0.0.1:3000 重启，日志见 server.log"
echo "接下来：打开  你的域名/console-7kq9mx2p  后台 → 见《上线清单.md》填几项即可。"
