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
