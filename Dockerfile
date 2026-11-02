# Multi-stage build for Railway and production
FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package*.json ./

FROM base AS builder

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --omit=dev && npm cache clean --force

FROM base AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs package*.json ./


USER nodejs

EXPOSE 5000

ENV NODE_ENV=production \
    PORT=5000 \
    NODE_OPTIONS="--max-old-space-size=512"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const port=process.env.PORT||5000; require('http').get('http://127.0.0.1:' + port + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
