# Regras de negócio — Backend

Invariantes confirmadas no código/testes. Divergências com regra de produto aprovada → pendência documental (não alterar comportamento só por doc).

## Trial e assinatura

- `TRIAL_DAYS = 30` em `shared/constants/subscription.ts`.
- Trial calendário **≠** inadimplência: não bloquear CPF só porque o trial acabou.
- Status bloqueados nas APIs operacionais: trial expirado sem assinatura válida, ou `PAST_DUE` / `CANCELED` / `UNPAID` → tipicamente **402** `SUBSCRIPTION_REQUIRED`.
- Inadimplência real pode levar a `BlockedEntity` / **403** `CPF_BLOCKED`.
- Pagamento aprovado (webhook) → desbloqueio + assinatura `ACTIVE`.
- `MASTER_ADMIN` isento de `checkSubscription`.
- Dashboard/insights: `checkDashboardAccess` / **403** `DASHBOARD_REQUIRED` no plano sem dashboard (exceto trial Pro).

## Tenant, permissões, RLS

- Tenant = `Barbershop`.
- `authorize(roles)` + permissões de employee onde aplicável.
- `setRlsContext` para isolamento; não assumir que todo endpoint já aplica RLS — verificar rota.

## Imagens & página pública (Cloudinary)

- **Todo upload de imagem é Cloudinary** via DI token `ImageStorageProvider` (logo, capa, avatar, produtos, posts/mídia); token legado `StorageProvider` (GCS→Cloudinary) só cobre **deletes de objects antigos** e vídeo legado. Env obrigatória: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (sem ela, upload → 503).
- Arte de posts (`FeedPost`): a data-URL gerada **no ato de salvar/publicar/editar** vira asset na pasta `posts-art` (`posts/services/postImageStorageService.ts`); `imageUrl` grava a URL pública e `imageAssetName` o `public_id` (NULL = legado base64/URL externa, sem asset a destruir). Falha de upload → 502 "tente de novo" (**nunca** regrava base64 no banco); gravação falha após upload → `destroy` do asset novo (compensação); update com arte nova → grava a nova e destrói a anterior; deletar post → destrói o asset (best-effort). Prévia (`POST /posts/generate`, preview de template) **nunca** sobe. **Formato da arte (decisão registrada):** camada de foto presente (upload **ou** stock ilustrativo) → **JPEG q90 4:4:4**; sem nenhuma camada de foto → **PNG** otimizado; prévia do editor → **JPEG** ~q78/540px — a escolha é automática no motor (`RenderSpec.output` omitido = auto; `preview: true` = prévia). O broadcast WhatsApp baixa a URL hospedada e enfileira base64 cru (falha de download → broadcast abortado com warn).
- Spec única de imagens em `shared/constants/imageSpecs.ts` (espelhada no front por `npm run theme:mirror`/`theme:check`): **capa aceita QUALQUER medida/proporção** (1920×1080 16:9 é só recomendação de UI — o recorte `c_fill,ar_16:9` e o ponto focal `coverFocalX/Y` são aplicados na entrega pelo helper único `frontend/src/shared/coverImage.ts`, com `coverWidth/coverHeight` do back evitando ampliação; ideal ≤2× da maior dimensão) e logo 1:1 exata (recomendado 512×512, mín. 400×400); JPEG/PNG/WebP. **Peso validado no back ANTES do decode** (`validateAndNormalizeImage` → 413: capa ≤5 MB, logo ≤2 MB via `maxBytes`) e teto de 5 MB no multipart global (rotas de vídeo/mídia sobrescrevem por chamada). Validação em 3 camadas: front (instantânea: tipo sempre; dimensões/proporção só do logo), back (`validateAndNormalizeImage` com sharp: peso, magic bytes, dimensões/proporção apenas do logo, EXIF removido) e Cloudinary.
- Upload direto assinado de imagem: `POST /barbershops/:id/uploads/sign` `{kind: cover|logo}` → back assina params (public_id determinístico, overwrite/invalidate, allowed_formats) e o cliente envia FormData direto ao Cloudinary com progresso/cancelamento; depois `POST /barbershops/:id/page-theme/cover/confirm` `{publicId, version}` → back consulta `cloudinary.api.resource` (autoridade: pasta do tenant, formato, version — dimensões livres) e, se o asset estiver fora do padrão, `destroy` + 400; grava `coverWidth/coverHeight` (original) preservando o focal atual. Rota multipart legada de capa mantida como fallback (sem limites de tamanho).
- `public_id` determinístico e sobrescrito: `agendaja/{barbershopId}/logo/logo` e `agendaja/{barbershopId}/cover/cover` (`overwrite` + `invalidate`); falha de DB após upload apaga o asset (sem órfão). Deletes roteiam pela origem (`shared/utils/imageAssetDeletion.ts`): URL/publicId do Cloudinary → `ImageStorageProvider`; URL do GCS legado → `StorageProvider`.
- Migração sob demanda de imagens GCS → Cloudinary: `npm run images:migrate-cloudinary` (dry-run; `--apply [--barbershop=<uuid>] [--limit=N] [--delete-source]`).
- Tema da página pública (`BarbershopPageTheme`, 1:1): cores hex + radius + botão + overlay 0–80 + capa (`coverFocalX/Y` 0–100, padrão 50/50 — aceito no `PUT`; `coverWidth/Height` só do servidor); **contraste WCAG AA validado no back por variante** (escura sempre; clara quando materializada — par reprovado → 400 com o nome da variante); `mode` (`AUTO|LIGHT|DARK`) + `darkColors`/`lightColors` (JSON), colunas planas = espelho legado do `darkColors` (linha sem JSON volta às planas); `PUT` exige OWNER do tenant (ou MASTER_ADMIN); rotas de upload/tema com rate limit próprio.
- Cartão OG da página pública: `GET /barbershops/:id/page-theme/og-image` gera PNG 1200×630 (cores do tema + nome do salão via sharp/SVG; fonte `font-noto-sans` no Dockerfile), cache 1h.

## Posts (formato da arte)

- **Formato padrão por modelo:** `price-split` → `portrait` (4:5); todos os demais → `square` (1:1). Fonte única no back: `defaultPostFormat()` em `modules/posts/services/postTemplates.ts`, que lê `PRICE_SPLIT_MANIFEST.defaultFormat` (manifesto do modelo).
- O catálogo `GET /api/posts/templates` devolve `defaultFormat` em cada modelo — **é o que o frontend lê** (o fallback local do editor vale só enquanto a lista não carrega/erro de rede). Front e back precisam ficar iguais: mudar a regra = mudar o manifesto/`defaultPostFormat` **e** o fallback do editor no mesmo PR, com o teste do catálogo (`postEditorialTemplates.spec.ts`) verificando os dois lados.
- `format` explícito sempre vence o default: `previewPostQuerySchema.format` é opcional (sem valor, a prévia usa o default do modelo) e o `create` persiste `body.format ?? defaultPostFormat(templateKey)`. O default é aplicado em um único ponto de render (`buildPostImage`), que alimenta prévia, preview de template, create e update.
- Prévia e arte final precisam sair no mesmo formato — por isso o `price-split` nasce 4:5 e não 1:1.

## Fila / agenda / híbrido

- Modos de operação do salão restringem join/booking (`shopOpenState`, WhatsApp obrigatório em alguns fluxos).
- Fila pública vs staff mascarada conforme auth.

## Pacotes

- Receita na venda do pacote (`pricePaid`); consumo/agenda debita sessão; cancelamento `CONFIRMED` restaura crédito (ver `packages.spec.ts`).

## Fiado / despesas / comissões

- Fiado com pagamentos parciais; validação de telefone/valores nos schemas.
- Comissões: módulo dedicado + testes de validação — confirmar regras ao alterar fechamento.

## Produtos / estoque / retail

- Estoque insuficiente → erro de negócio (`INSUFFICIENT_STOCK`), não 500 genérico.
- SKU/barcode únicos por tenant (índices parciais + asserts).
- Venda/estorno: idempotência e prevenção de duplicidade financeira (serviços de idempotency / refunds).
- Resumos financeiros de produtos devem **liquidar estornos** (net), não só bruto.
- `DELETE /products/:id` só apaga produto **sem histórico** (`stock_movements`, `inventory_receipt_items`, `retail_sale_lines`, `retail_sale_refund_lines`) e sem reserva `RESERVED` vigente; caso contrário 409 `PRODUCT_HAS_HISTORY` / `PRODUCT_HAS_OPEN_RESERVATIONS` (recomendação: Inativar). Reservas finalizadas caem em cascata. Checagem e delete rodam **fora** de `prisma.$transaction` (mesmo motivo do P2028 da extensão de RLS).

### Reserva de produto (público → painel)

- A reserva **não decrementa** `stockQty`. Disponível = `stockQty − Σ(reservas `RESERVED` com `expiresAt > now`)`, recalculado a cada leitura (não existe cron de expiração).
- `trackStock = false` → sempre disponível (`available: null` no DTO público).
- Máximo de **3 reservas abertas** por WhatsApp no mesmo salão (`RESERVATION_LIMIT_REACHED`, 409); `quantity` 1..10; WhatsApp só dígitos (10–11, mesmo `phoneBR` da agenda).
- `unitPrice` é congelado no ato da reserva; status final (`PICKED_UP`/`CANCELED`) é imutável (409 `RESERVATION_FINALIZED`).
- Prazo de retenção via env `PRODUCT_RESERVATION_RETENTION_HOURS` (padrão 48h).
- DTO público expõe apenas `id, name, description, imageUrl, price, unitLabel, category, available` — custo/SKU/código/lote ficam no painel autenticado.
- Criar reserva usa transação com `SELECT … FOR UPDATE` **em SQL puro**: a extensão de RLS (`libs/prismaExtensions.ts`) roteia operações de modelo para outra conexão do pool e quebraria a atomicidade (deadlock/P2028).
- `PICKED_UP` **não** baixa `stockQty`: a reserva sai da soma de `RESERVED`, então a unidade volta a aparecer como disponível até o dono registrar a venda na aba Vendas (baixa automática fora de escopo).
- `GET /products` devolve `reservedQty` (só vigentes) e `availableQty` (`null` quando `trackStock = false`). `reservations[]` com `customerName`/`whatsapp` só vai para OWNER/MASTER_ADMIN ou quem tem `PRODUCTS_VIEW` / `PRODUCTS_MANAGE` / `RETAIL_SELL` (`permissions.canSeeReservationCustomer`); permissão só de `INVENTORY_MANAGE` recebe apenas os totais.
- Criar reserva **avisa o dono do salão** (nunca o cliente), fire-and-forget em `productReservations/reservationNotify.ts`: WhatsApp Evolution + e-mail `product_reservation_alert` (categoria `OPERATION`), um `try/catch` por canal e dedup `product-reservation:{id}:{whatsapp|email}` — falha de notificação não atrasa nem derruba a reserva (201 continua 201).

## Notificações

- Evolution WhatsApp: opcional; sem credenciais = no-op / falha isolada.
- E-mail Resend + filas BullMQ; allowlist em dev.
- Crons: lembretes de agenda, publisher de posts, etc.

## Pagamentos

Providers **implementados:** Asaas, AbacatePay, Mercado Pago.

- **Produção (default):** só Asaas (`paymentProviders.ts` fallback `["ASAAS"]`).
- Override: env `PAYMENT_PROVIDERS_ENABLED`.
- Webhooks com verificação de assinatura/token; modo inseguro só com flag explícita de não-produção.
