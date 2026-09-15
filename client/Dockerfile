# ── 阶段 1：前端构建（Node 22 + pnpm，版本由 package.json packageManager 锁定） ──
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.23.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# build = tsc -b && vite build（类型检查失败即构建失败）
RUN pnpm build

# ── 阶段 2：nginx 托管静态产物并反代 /api（tech-stack §4.5） ───────────────
FROM nginx:1.29-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
