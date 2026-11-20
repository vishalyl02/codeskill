# ==============================================================================
# CodeSkill Frontend (Next.js) — Production Multi-Stage Dockerfile
# Builds immutable, optimized Next.js container (AMD64 & ARM64)
# ==============================================================================

# --- Stage 1: Dependencies ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
# The speech worker uses browser WebAssembly and does not need CUDA binaries.
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --legacy-peer-deps

# --- Stage 2: Builder ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Arguments for client-side environment variables baked into bundles
ARG NEXT_PUBLIC_API_URL=https://codeskill.novaserve.cloud/api
ARG NEXT_PUBLIC_SOCKET_URL=https://codeskill.novaserve.cloud
ARG NEXT_PUBLIC_SITE_URL=https://codeskill.novaserve.cloud
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=968191151730-mglf3rq4pldoqqhhcrbqfbt9g2j9n8o6.apps.googleusercontent.com

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile Next.js production build
RUN npm run build

# Remove development dependencies
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm prune --omit=dev --legacy-peer-deps

# --- Stage 3: Production Runner ---
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl tzdata

ENV NODE_ENV=production
ENV PORT=3000
ENV PM2_HOME=/tmp/.pm2
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/next.config.* ./

USER nextjs

EXPOSE 3000

# Container-level Liveness Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["npm", "run", "start", "--", "-p", "3000"]
