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
| Produtos / estoque / retail | `/products`, inventory, sales | `Product`, movimentos, `RetailSale*` |
| Fiado / despesas | `/fiado`, `/expenses` | `Fiado`, `FiadoPayment`, `Expense*` |
| Comissões | `/commissions` | modelos de comissão |
| Assinaturas / planos / pagamentos | `/subscriptions`, `/plans`, `/payments`, webhooks | `Subscription`, `Plan`, `Invoice`, `Payment`, `BlockedEntity` |
| Feed / posts | `/feed`, `/posts` | `FeedPost` / posts |
| Admin | `/admin/*` | agregações + audit/notifications |
| Notificações | `/notifications` + filas | deliveries / Evolution |
| Referrals | `/referrals` | `ReferralCode`, `Referral` |
| Contact | `/contact` | formulário / notificação |

## Checkout de assinatura (implementado)

`SubscribeUseCase` + `config/paymentProviders.ts`:

| Método | Provider | Papel |
|---|---|---|
| `asaas` | Asaas | **Padrão em produção**. PIX embutido (QR). Cartão via **checkout hospedado** (`invoiceUrl`) — PAN/CVV não transitam pelo Fastify. |
| `payment_link` | AbacatePay | Implementado; em prod só se habilitado via env |
| `pix` / cartão | Mercado Pago | Implementado; em prod só se habilitado via env |

Em não-produção, o fallback habilita os três. Override: `PAYMENT_PROVIDERS_ENABLED` (lista separada por vírgula).

Cartão Asaas: o cliente informa PAN só no checkout hospedado da Asaas. Tokens vaulted antigos ainda podem ser cobrados pelo cron pós-trial. Não reintroduzir `asaasCreditCard` no body do Fastify.

## Testes

Há dezenas de `*.spec.ts` (unit) + pastas `tests/integration` e `tests/pentest`. Cobertura de comportamento ≠ garantia de produção.
