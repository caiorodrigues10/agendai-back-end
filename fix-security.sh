#!/usr/bin/env bash
# =============================================================================
# fix-security.sh — Corrige os dois problemas de segurança restantes:
#   1. POST /queue aceita customerId forjado no body
#   2. Webhook aceita qualquer requisição quando SECRET não está definido
#
# Execute na raiz do projeto:  bash fix-security.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC}   $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
step() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

[ -f "package.json" ] || { echo "Execute na raiz do projeto"; exit 1; }

# =============================================================================
# PROBLEMA 1 — POST /queue aceita customerId forjado no body
#
# O endpoint é público (clientes entram na fila sem conta), então não há
# autenticação para verificar o customerId. Qualquer pessoa podia passar
# o ID de outro usuário no body.
#
# CORREÇÃO:
#   - customerId é REMOVIDO do body schema
#   - Se a requisição vier autenticada (staff adicionando cliente):
#       customerId = request.user.id
#   - Se vier sem autenticação (cliente entrando sozinho):
#       customerId = crypto.randomUUID() gerado server-side
#
# Isso preserva o comportamento existente — apenas a origem do ID muda.
# =============================================================================
step "1 · JoinQueueController — remover customerId do body, gerar server-side"

cat > src/modules/queue/useCases/joinQueue/JoinQueueController.ts << 'EOF'
import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { randomUUID } from "node:crypto";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { z } from "zod";

export class JoinQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    // customerId NÃO vem do body — nunca confiar em ID fornecido pelo cliente.
    // Isso impede que qualquer pessoa forge o ID de outro usuário.
    const schema = z.object({
      barbershopId: z.string().uuid("barbershopId inválido"),
      serviceId:    z.string().uuid("serviceId inválido"),
      customerName: z.string().min(2, "Nome obrigatório").max(200),
      whatsapp:     z.string().min(8, "WhatsApp inválido").max(20),
      addedByStaff: z.boolean().optional()
    });

    const data = schema.parse(request.body);

    // Se autenticado (staff adicionando um cliente): usa o ID do usuário logado.
    // Se não autenticado (cliente entrando sozinho): gera UUID aleatório server-side.
    const customerId = request.user?.id ?? randomUUID();

    const useCase = container.resolve(JoinQueueUseCase);
    const item = await useCase.execute({ ...data, customerId });

    return reply.status(201).send(item);
  }
}
EOF

ok "JoinQueueController — customerId gerado server-side (não vem mais do body)"

# =============================================================================
# PROBLEMA 2 — Webhook aceita qualquer requisição quando SECRET não está definido
#
# O código original fazia:
#   if (!secret) return true;
# Ou seja, sem a variável de ambiente configurada, qualquer POST para
# /payments/webhook era aceito e processava atualizações de pagamento.
# Um atacante poderia forçar um pagamento a aparecer como "aprovado".
#
# CORREÇÃO:
#   - Em produção (NODE_ENV=production): SECRET ausente = rejeitar com 401
#     e logar um erro crítico (a aplicação está mal configurada)
#   - Em desenvolvimento (outros NODE_ENV): SECRET ausente = logar aviso
#     e deixar passar (não quebra o ambiente local sem configuração)
#
# Isso garante que o ambiente de produção seja seguro por padrão, sem
# impedir o desenvolvimento local antes da configuração do MP.
# =============================================================================
step "2 · ProcessWebhookController — rejeitar em produção quando SECRET está ausente"

cat > src/modules/payments/useCases/processWebhook/ProcessWebhookController.ts << 'EOF'
import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ProcessWebhookUseCase } from "./ProcessWebhookUseCase";
import { IMercadoPagoWebhookDTO } from "../../dtos/IPaymentDTO";
import crypto from "node:crypto";
import { z } from "zod";

// Schema de validação do webhook para evitar crashes com payloads malformados
const webhookBodySchema = z.object({
  id:              z.number().optional(),
  live_mode:       z.boolean().optional(),
  type:            z.string(),
  date_created:    z.string().optional(),
  application_id:  z.number().optional(),
  user_id:         z.number().optional(),
  version:         z.number().optional(),
  api_version:     z.string().optional(),
  action:          z.string().optional(),
  data: z.object({
    // MP pode enviar id como string ou número — normalizamos para string
    id: z.union([z.string(), z.number()]).transform(String)
  })
});

export class ProcessWebhookController {
  private validateSignature(request: FastifyRequest): boolean {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const isProduction = process.env.NODE_ENV === "production";

    if (!secret) {
      if (isProduction) {
        // Em produção sem SECRET configurado: a aplicação está mal configurada.
        // Rejeitar toda requisição e alertar — nunca aceitar cegamente.
        request.log.error(
          "CRÍTICO: MERCADOPAGO_WEBHOOK_SECRET não está definido em produção. " +
          "Todas as requisições de webhook serão rejeitadas até a variável ser configurada."
        );
        return false;
      }

      // Em desenvolvimento: logar aviso e deixar passar para facilitar testes locais.
      request.log.warn(
        "MERCADOPAGO_WEBHOOK_SECRET não definido — validação de assinatura ignorada " +
        "(ambiente de desenvolvimento). Defina a variável antes de ir a produção."
      );
      return true;
    }

    // SECRET definido: validar assinatura HMAC-SHA256
    const signatureHeader = request.headers["x-signature"] as string | undefined;
    const requestId       = request.headers["x-request-id"] as string | undefined;

    if (!signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [k, v] = part.split("=");
        return [k.trim(), v?.trim() ?? ""];
      })
    );

    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    const rawBody = request.body as any;
    const dataId  = rawBody?.data?.id ?? "";
    const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    try {
      // timingSafeEqual evita timing attacks na comparação
      return crypto.timingSafeEqual(
        Buffer.from(v1, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch {
      return false;
    }
  }

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.validateSignature(request)) {
      return reply.status(401).send({ message: "Assinatura inválida" });
    }

    // Valida o body antes de processar — payload malformado não deve crashar
    const parseResult = webhookBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn(
        { errors: parseResult.error.errors },
        "Webhook payload inválido recebido"
      );
      // Retorna 200 mesmo assim: o MP não deve retentar por erro de schema nosso
      return reply.status(200).send({ received: true });
    }

    // Responde imediatamente ao MP para evitar timeout e retentativas
    reply.status(200).send({ received: true });

    // Processa de forma assíncrona — falha aqui não afeta a resposta ao MP
    const useCase = container.resolve(ProcessWebhookUseCase);
    useCase
      .execute(parseResult.data as IMercadoPagoWebhookDTO)
      .catch((err) => {
        request.log.error(err, "Erro ao processar webhook do Mercado Pago");
      });
  }
}
EOF

ok "ProcessWebhookController — produção rejeita quando SECRET ausente; dev loga aviso"

# =============================================================================
# RESUMO
# =============================================================================

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║         ✅  Correções de segurança aplicadas                ║${NC}"
echo -e "${GREEN}  ╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}✔${NC} [FILA]     customerId removido do body de POST /queue"
echo -e "             → autenticado:  usa request.user.id"
echo -e "             → público:      gera randomUUID() server-side"
echo ""
echo -e "  ${GREEN}✔${NC} [WEBHOOK]  SECRET ausente em produção agora rejeita com 401"
echo -e "             → produção sem SECRET: rejeita + log crítico"
echo -e "             → desenvolvimento sem SECRET: loga aviso + deixa passar"
echo ""
echo -e "${YELLOW}  Lembrete: defina MERCADOPAGO_WEBHOOK_SECRET no seu .env de produção.${NC}"
echo -e "${YELLOW}  O único problema restante que exige ação manual é trocar os${NC}"
echo -e "${YELLOW}  JWT_SECRET e JWT_REFRESH_SECRET por valores longos e aleatórios.${NC}"
echo ""
