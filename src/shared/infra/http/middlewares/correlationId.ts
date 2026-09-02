import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

const CORRELATION_HEADER = 'x-correlation-id';
const VALID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

/**
 * Middleware that:
 * 1. Reads correlation ID from request header (or generates one)
 * 2. Attaches it to the request for downstream use
 * 3. Returns it in the response header
 */
export async function correlationIdMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const supplied = request.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;

  const correlationId =
    typeof candidate === 'string' && VALID_PATTERN.test(candidate)
      ? candidate
      : randomUUID();

  request.correlationId = correlationId;
  reply.header('X-Correlation-Id', correlationId);
}
