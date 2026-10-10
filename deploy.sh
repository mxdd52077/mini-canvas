#!/usr/bin/env bash
# 将本项目通过 tar-over-ssh 同步到远程主机，并在远端构建/启动容器。
# 不依赖远端 rsync；远端命令按 cmd.exe / Windows OpenSSH 编写（Git Bash 可选）。
# 用法:
#   ./deploy.sh                 # 部署到 .env 中的 DEPLOY_HOST
#   DEPLOY_HOST=server.example.com DEPLOY_USER=deploy ./deploy.sh
#   ./deploy.sh --init          # 首次：把本地 .env 推到远端
#   ./deploy.sh --dry-run       # 只打包不上传
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
# 当前脚本按 Windows OpenSSH + Git Bash 编写。
DEPLOY_DIR="${DEPLOY_DIR:-C:/opt/mini-canvas}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.selfhost.yml}"

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "错误: 请在 .env 中设置 DEPLOY_HOST，或执行 DEPLOY_HOST=example.com ./deploy.sh"
  exit 1
fi

SSH_CMD=(ssh -p "$SSH_PORT")
SCP_CMD=(scp -P "$SSH_PORT")
if [[ -n "$SSH_KEY" ]]; then
  SSH_CMD+=(-i "$SSH_KEY")
  SCP_CMD+=(-i "$SSH_KEY")
fi

MODE=deploy
if [[ "${1:-}" == "--dry-run" ]]; then
  MODE=dry-run
elif [[ "${1:-}" == "--init" ]]; then
  MODE=init
fi

TAR_EXCLUDES=(
  --exclude='./.git'
  --exclude='./node_modules'
  --exclude='./vendor/node_modules'
  --exclude='./.next'
  --exclude='./.env'
  --exclude='./.env.local'
  --exclude='./.env.*.local'
  --exclude='./.claude'
  --exclude='./tests'
  --exclude='./npm-debug.log*'
  --exclude='./.sites-runtime'
  --exclude='./dist-server'
  --exclude='./coverage'
)

echo "==> 同步到 ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}"

# 远端目录（cmd.exe 的 mkdir 会自动建多级目录）
"${SSH_CMD[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "if not exist \"${DEPLOY_DIR}\" mkdir \"${DEPLOY_DIR}\""

if [[ "$MODE" == "init" ]]; then
  if [[ ! -f .env ]]; then
    echo "错误: 本地缺少 .env。请先:"
    echo "  cp .env.example .env"
    echo "  node deploy/gen-supabase-keys.mjs"
    exit 1
  fi
  "${SCP_CMD[@]}" .env "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/.env"
  echo "==> 已推送 .env 到远端"
  exit 0
fi

if [[ "$MODE" == "dry-run" ]]; then
  echo "==> dry-run：打包测试"
  tar czf /dev/null "${TAR_EXCLUDES[@]}" . && echo "   打包成功"
  echo "==> dry-run 结束，未执行远端构建"
  exit 0
fi

echo "==> 传输源码（tar-over-ssh）"
tar czf - "${TAR_EXCLUDES[@]}" . \
  | "${SSH_CMD[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "tar xzf - -C \"${DEPLOY_DIR}\""

echo "==> 远端构建并启动（${COMPOSE_FILE}）"
# 远端默认 shell 是 cmd.exe：把 remote-up.sh 拷过去，再用 Git Bash 跑，
# 避免 heredoc/变量在本地被提前展开。
"${SCP_CMD[@]}" deploy/remote-up.sh deploy/build-deps-image.sh "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/"
"${SSH_CMD[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "\"C:\\Program Files\\Git\\bin\\bash.exe\" \"${DEPLOY_DIR}/remote-up.sh\" \"${DEPLOY_DIR}\" \"${COMPOSE_FILE}\""

echo
echo "==> 部署完成"
echo "   Web:    ${SITE_URL:-http://localhost:${WEB_PORT:-3000}}"
echo "   API:    ${API_EXTERNAL_URL:-http://localhost:${SUPABASE_API_PORT:-8000}}"
echo "   Collab: ${NEXT_PUBLIC_COLLABORATION_URL:-ws://localhost:${COLLABORATION_PORT:-8787}}"
