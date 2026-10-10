#!/usr/bin/env bash
# 生成 mini-canvas-node-deps:local 镜像（含 Linux 版 node_modules）。
# BuildKit 内 npm ci 在目标机上会假死，改用 docker run 安装后 commit。
# 用法: build-deps-image.sh <project-dir>
set -euo pipefail

PROJECT_DIR="${1:?project dir}"
IMAGE="${NODE_DEPS_IMAGE:-mini-canvas-node-deps:local}"

export MSYS_NO_PATHCONV=1

LOCK_HASH=$(sha256sum "$PROJECT_DIR/package-lock.json" | awk '{print $1}')

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  built_hash=$(docker run --rm "$IMAGE" cat /tmp/.lock-hash 2>/dev/null || echo "")
  if [[ "$LOCK_HASH" == "$built_hash" ]]; then
    echo "==> deps 镜像已是最新：$IMAGE"
    exit 0
  fi
fi

echo "==> 构建 deps 镜像：$IMAGE"
CONTAINER="mc-deps-build-$$"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run --name "$CONTAINER" \
  -v "${PROJECT_DIR}:/src:ro" \
  -e "LOCK_HASH=$LOCK_HASH" \
  node:22.19-alpine sh -c '
    set -e
    cp /src/package.json /src/package-lock.json /tmp/
    cd /tmp
    npm config set registry https://registry.npmmirror.com
    npm config set fetch-retries 5
    npm config set maxsockets 3
    npm ci --no-audit --no-fund
    printf %s "$LOCK_HASH" > /tmp/.lock-hash
  '
docker commit --change 'WORKDIR /tmp' "$CONTAINER" "$IMAGE"
docker rm "$CONTAINER"
echo "==> 完成：$IMAGE"
