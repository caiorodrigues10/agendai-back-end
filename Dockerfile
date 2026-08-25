# Build stage
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl ca-certificates wget && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3333

ENV NODE_ENV=production

CMD ["node", "dist/shared/infra/http/server.js"]