import { FastifyRequest, FastifyReply } from 'fastify';
import { resolveCorrelationId, runWithCorrelationId } from '@/shared/utils/correlationContext';

const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Anexa o correlationId ao request, ao logger da request e ao
 * AsyncLocalStorage (B21): todo log de módulo, enqueue e handler derivado
 * desta request herda o mesmo correlationId sem passar parâmetro na mão.
 *
 * Callback (e não async) de propósito: `done()` roda dentro do escopo do
 * ALS, propagando o contexto para o restante do ciclo de vida da request
 * — mesma semântica de `setRlsContext`.
 */
export function correlationIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
) {
  // No app de produção o genReqId (app.ts) já aplicou a mesma validação,
  // então header e request.id convergem; o fallback cobre instâncias
  // Fastify montadas sem o genReqId customizado.
  const suprido = request.headers[CORRELATION_HEADER];
  const candidato = Array.isArray(suprido) ? suprido[0] : suprido;
  const correlationId = resolveCorrelationId(candidato ?? request.id);

  request.correlationId = correlationId;
  const filho = request.log?.child?.({ correlationId });
  if (filho) request.log = filho;
  reply.header('X-Correlation-Id', correlationId);

  runWithCorrelationId(correlationId, done);
}
