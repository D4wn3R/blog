#!/usr/bin/env bash
# 通用部署脚本：rsync 源码到远端主机 → 远端后台重建镜像（长构建防 SSH 断连）→ 轮询健康
#
# 用法：DEPLOY_HOST=<ssh 别名或 user@host> bash scripts/deploy.sh
# 可选：DEPLOY_DIR 远端目录（默认 /opt/blog）
# 前置：本地 ~/.ssh/config 配好该主机别名；凭证 .env / backend/.env 只存在于服务器侧，
#       rsync 显式排除，永不覆盖线上配置
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOY_HOST:?请设置 DEPLOY_HOST，例如：DEPLOY_HOST=myserver bash scripts/deploy.sh}"
readonly REMOTE_DIR="${DEPLOY_DIR:-/opt/blog}"

echo ">> rsync 源码 → ${DEPLOY_HOST}:${REMOTE_DIR}"
rsync -az \
  --exclude=.git --exclude=.idea --exclude=node_modules --exclude=dist \
  --exclude=bin --exclude=.env --exclude=backend/.env --exclude='*.log' \
  ./ "${DEPLOY_HOST}:${REMOTE_DIR}/"

echo ">> 远端后台构建（日志 /tmp/blog-build.log）"
ssh "$DEPLOY_HOST" "cd ${REMOTE_DIR} && nohup docker compose build > /tmp/blog-build.log 2>&1 &"

echo ">> 等待构建完成（最长 15 分钟）"
ok=0
for _ in $(seq 1 90); do
  sleep 10
  # [c] 技巧防 pgrep 自匹配：否则轮询命令自身命令行命中模式，永远误判构建中
  if ! ssh "$DEPLOY_HOST" 'pgrep -f "[c]ompose build" >/dev/null 2>&1'; then ok=1; break; fi
done
[ "$ok" = 1 ] || {
  echo "构建超时，查日志：ssh ${DEPLOY_HOST} tail -50 /tmp/blog-build.log" >&2
  exit 1
}

if ssh "$DEPLOY_HOST" 'grep -qiE "ERROR|failed to solve" /tmp/blog-build.log'; then
  echo "构建失败：" >&2
  ssh "$DEPLOY_HOST" 'grep -iE "ERROR|failed to solve" /tmp/blog-build.log | tail -5' >&2
  exit 1
fi

echo ">> 重启容器"
ssh "$DEPLOY_HOST" "cd ${REMOTE_DIR} && docker compose up -d"

echo ">> 轮询 backend 健康（最长 5 分钟）"
for _ in $(seq 1 30); do
  sleep 10
  status=$(ssh "$DEPLOY_HOST" "docker inspect -f '{{.State.Health.Status}}' blog-backend 2>/dev/null" || true)
  if [ "$status" = "healthy" ]; then
    # backend 8080 不映射宿主机，健康验证走 nginx 反代（生产 80）
    ssh "$DEPLOY_HOST" 'curl -sm 5 -o /dev/null -w "health HTTP %{http_code}\n" http://127.0.0.1/api/health'
    echo ">> 同步完成，线上就绪"
    exit 0
  fi
done
echo "backend 未就绪，查日志：ssh ${DEPLOY_HOST} docker logs --tail 50 blog-backend" >&2
exit 1
