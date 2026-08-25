import pino from 'pino';

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
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.authorization',
      '*.creditCard',
      '*.cpf',
      '*.cpfCnpj',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

export const logger = baseLogger;

export function getModuleLogger(module: string) {
  return baseLogger.child({ module });
}