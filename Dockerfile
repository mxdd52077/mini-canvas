# syntax=docker/dockerfile:1.7

# 可选：构建期 npm / apk 源（内网/国内环境见 docker-compose.selfhost.yml）
ARG NPM_REGISTRY=""
ARG ALPINE_MIRROR=""
# 预构建依赖镜像（deploy/build-deps-image.sh 生成），内含 /tmp/node_modules
ARG NODE_DEPS_IMAGE=mini-canvas-node-deps:local

FROM ${NODE_DEPS_IMAGE} AS prebuilt-deps

FROM node:22.19-alpine AS deps
ARG NPM_REGISTRY
ARG ALPINE_MIRROR
WORKDIR /app
RUN if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories; \
    fi \
    && apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
# BuildKit 内 npm ci 在部分内网环境会假死，改用预构建镜像里的 node_modules
COPY --from=prebuilt-deps /tmp/node_modules ./node_modules

FROM node:22.19-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_COLLABORATION_URL="ws://localhost:8787"
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_COLLABORATION_URL=$NEXT_PUBLIC_COLLABORATION_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.19-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

FROM node:22.19-alpine AS collaboration
ARG NPM_REGISTRY
WORKDIR /app
ENV NODE_ENV=production
ENV COLLABORATION_PORT=8787
COPY package.json package-lock.json ./
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
    && npm config set fetch-retries 5 \
    && npm config set maxsockets 3 \
    && npm ci --omit=dev --no-audit --no-fund
COPY server ./server
USER node
EXPOSE 8787
CMD ["./node_modules/.bin/tsx", "server/collaboration.ts"]
