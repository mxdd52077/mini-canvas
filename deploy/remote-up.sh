#!/usr/bin/env bash
# 在远端执行：预装 vendor/node_modules、校验 .env、用独立 Docker config 启动 compose。
# 用法: remote-up.sh <deploy-dir> <compose-file>
set -euo pipefail

DEPLOY_DIR="${1:?deploy dir}"
COMPOSE_FILE="${2:?compose file}"

cd "$DEPLOY_DIR"

if [[ ! -f .env ]]; then
  echo "错误: 远端缺少 .env。请先在本机执行 ./deploy.sh --init"
  exit 1
fi

# Git Bash 会把 /path 转成 C:/Program Files/Git/path，docker 参数要关掉转换
export MSYS_NO_PATHCONV=1

# ---- 预构建依赖镜像（BuildKit 内 npm ci 会假死）----
bash "$(dirname "$0")/build-deps-image.sh" "$DEPLOY_DIR"

# ---- Docker Desktop credsStore 在 SSH 非交互会话里会挂 ----
mkdir -p .docker-ssh
if [[ ! -f .docker-ssh/config.json ]]; then
  printf '%s' '{"auths":{}}' > .docker-ssh/config.json
fi
export DOCKER_CONFIG="$(pwd)/.docker-ssh"

# 镜像需预先 docker load；registry 不可达时用 --pull never
docker compose -f "$COMPOSE_FILE" --env-file .env up -d --build --pull never

# Apply idempotent application migrations to both existing and fresh data volumes.
for attempt in {1..30}; do
  if docker compose -f "$COMPOSE_FILE" --env-file .env exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "错误: 数据库未在预期时间内就绪"
    exit 1
  fi
  sleep 2
done
for migration in supabase/migrations/*.sql; do
  [[ -f "$migration" ]] || continue
  echo "==> 应用数据库迁移: $migration"
  docker compose -f "$COMPOSE_FILE" --env-file .env exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres' < "$migration"
done
echo
echo "==> 服务状态"
docker compose -f "$COMPOSE_FILE" --env-file .env ps
