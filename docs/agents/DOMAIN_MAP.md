# Mapa de domínio — Backend

Fluxo HTTP:

`Route + preHandler → Controller → UseCase → IRepository/IProvider → implementação → DB/externo`

Persistência: Prisma 6.4 + PostgreSQL (`@prisma/adapter-pg`). RLS via `setRlsContext` quando aplicável.

## Domínios → persistência (visão)

| Domínio | Rotas | Persistência principal |
|---|---|---|
| Auth / users | `/auth`, `/users` | `User`, `RefreshToken` |
| Barbershop / schedule / logo | `/barbershops` | `Barbershop`, `Schedule` |
| Serviços / categorias | `/services`, `/service-categories` | `Service`, `ServiceCategory` |
| Fila | `/queue` | `QueueItem` |
| Agenda | `/appointments` | `Appointment` |
| Clientes / CRM | `/clients`, `/crm` | `SalonClient` + agregações CRM |
| Pacotes | `/service-packages`, `/client-packages` | `ServicePackage`, `ClientPackage` |
| Produtos / estoque / retail | `/products` (CRUD, incl. `DELETE /products/:id`), inventory, sales | `Product`, movimentos, `RetailSale*` |
| Reservas de produto (vitrine pública) | `/barbershops/:id/public-products/*` (público) + `/product-reservations` (painel) + aviso ao salão em `productReservations/reservationNotify.ts` (WhatsApp + e-mail `product_reservation_alert`) | `ProductReservation` |
| Fiado / despesas | `/fiado`, `/expenses` | `Fiado`, `FiadoPayment`, `Expense*` |
| Comissões | `/commissions` | modelos de comissão |
| Assinaturas / planos / pagamentos | `/subscriptions`, `/plans`, `/payments`, webhooks | `Subscription`, `Plan`, `Invoice`, `Payment`, `BlockedEntity` |
| Feed / posts | `/feed`, `/posts` | `FeedPost` / posts |
| Admin | `/admin/*` | agregações + audit/notifications |
| Notificações | `/notifications` + filas | deliveries / Evolution |
| NPS | `/admin/nps/*` (master) + `/nps/:surveyId` (público, com rate limit) | `NpsSurvey`, `NpsResponse`; gating via `NotificationPreference` (`NPS_SURVEY`) e `NotificationSuppression` |
| Referrals | `/referrals` | `ReferralCode`, `Referral` |
| Contact | `/contact` | formulário / notificação |

## Checkout de assinatura (implementado)

`SubscribeUseCase` + `config/paymentProviders.ts`:

| Método | Provider | Papel |
|---|---|---|
| `asaas` | Asaas | **Padrão em produção**. PIX embutido (QR). Cartão na própria página (checkout transparente): o PAN segue só até a Asaas e não é gravado. |
| `payment_link` | AbacatePay | Implementado; em prod só se habilitado via env |
| `pix` / cartão | Mercado Pago | Implementado; em prod só se habilitado via env |

Em não-produção, o fallback habilita os três. Override: `PAYMENT_PROVIDERS_ENABLED` (lista separada por vírgula).

Cartão Asaas: o formulário fica no checkout do app. O body `asaasCreditCard` é repassado à Asaas e não entra em log, idempotência nem `rawResponse`. O trial guarda só o token criptografado para o cron pós-trial.

## Testes

Há dezenas de `*.spec.ts` (unit) + pastas `tests/integration` e `tests/pentest`. Cobertura de comportamento ≠ garantia de produção.
