import pino from 'pino';
import { getCorrelationId } from './correlationContext';

const isProduction = process.env.NODE_ENV === 'production';

const baseLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  base: {
    service: 'agendai-backend',
    env: process.env.NODE_ENV || 'development',
  },
  redact: {
    paths: [
      '*.password',
      '**.password',
      '*.token',
      '**.token',
      '*.secret',
      '*.apiKey',
      '*.authorization',
      '*.ccv',
      '*.cvv',
      '*.cardNumber',
      '*.asaasCreditCard',
      'req.body.password',
      'req.body.recaptchaToken',
      'req.body.cardToken',
      'req.body.token',
      'req.body.asaasCreditCard',
      '*.creditCard',
      '*.cpf',
      '*.cpfCnpj',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

const METODOS_DE_LOG = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

/**
 * Devolve um logger que injeta `correlationId` ( AsyncLocalStorage) em toda
 * chamada de log, tornando os logs de módulo correlacionáveis ao request,
 * job ou cron que originou a execução. Valor explícito no objeto do chamador
 * tem prioridade; `Error` como primeiro argumento é reescrito como `{ err }`,
 * que é exatamente o que o pino faria internamente (proto.js write()).
 */
export function withCorrelationLogs<T>(alvo: T): T {
  if ((alvo as { __correlationLogs?: boolean })?.__correlationLogs) return alvo;

  const proxy = new Proxy(alvo as object, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);

      if (
        typeof prop === 'string' &&
        METODOS_DE_LOG.includes(prop) &&
        typeof valor === 'function'
      ) {
        return (...argumentos: unknown[]) => {
          const correlationId = getCorrelationId();
          if (!correlationId || argumentos.length === 0) {
            return valor.call(destino, ...argumentos);
          }

          const [primeiro, segundo, ...demais] = argumentos;
          if (primeiro instanceof Error) {
            return valor.call(
              destino,
              { err: primeiro, correlationId },
              ...argumentos.slice(1),
            );
          }
          if (typeof primeiro === 'string') {
            return valor.call(destino, { correlationId }, ...argumentos);
          }
          if (primeiro == null) {
            return valor.call(
              destino,
              { correlationId },
              ...argumentos.slice(1),
            );
          }
          if (typeof primeiro === 'object') {
            const objeto = primeiro as Record<string, unknown>;
            const comCorrelacao =
              objeto.correlationId === undefined
                ? { ...objeto, correlationId }
                : objeto;
            return valor.call(destino, comCorrelacao, ...argumentos.slice(1));
          }
          return valor.call(destino, ...argumentos);
        };
      }

      if (prop === 'child' && typeof valor === 'function') {
        return (...argumentos: unknown[]) =>
          withCorrelationLogs(valor.call(destino, ...argumentos));
      }

      return typeof valor === 'function' ? valor.bind(destino) : valor;
    },
  }) as T;

  try {
    Object.defineProperty(proxy, '__correlationLogs', { value: true });
  } catch {
    /* objeto selado — segue sem marca de idempotência */
  }
  return proxy;
}

export const logger = withCorrelationLogs(baseLogger);

export function getModuleLogger(module: string) {
  return withCorrelationLogs(baseLogger.child({ module }));
}
