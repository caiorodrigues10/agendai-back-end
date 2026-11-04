# Build stage
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# traineddata do Tesseract (OCR de importação por imagem).
# A rede é usada AQUI, no build — nunca em runtime. O arquivo não é
# versionado no repositório (dezenas de MB por idioma); em runtime o
# tesseract.js lê ${OCR_TESSDATA_PATH}/<lang>.traineddata do disco.
RUN npm run ocr:tessdata

# Production stage
FROM node:22-alpine AS runner

# font-noto: pacote de fontes Noto disponível no Alpine; sharp usa a fonte
# para renderizar o texto dos cartões OG.
RUN apk add --no-cache openssl ca-certificates wget font-noto && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.tesseract-cache ./.tesseract-cache
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3333

ENV NODE_ENV=production
# OCR: o traineddata vem da etapa de build (acima). O servidor NUNCA
# baixa nada em runtime — sem o arquivo, o upload de imagem é recusado
# com 503 OCR_TRAINEDDATA_MISSING.
ENV OCR_TESSDATA_PATH=/app/.tesseract-cache

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/shared/infra/http/server.js"]
