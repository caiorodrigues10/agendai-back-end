import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { sanitizeSensitiveText } from './securitySanitization';

function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (/authorization|cookie|token|secret/i.test(key)) delete event.request.headers[key];
      }
    }
  }
  if (event.message) event.message = sanitizeSensitiveText(event.message, 1000) ?? undefined;
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = sanitizeSensitiveText(exception.value, 1000) ?? undefined;
  }
  event.extra = event.extra ? { note: 'Dados de request removidos pela política de segurança.' } : event.extra;
  return event;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || '1.0.0',
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    beforeSend(event) {
      return scrubEvent(event);
    },
  });

  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (error) => {
    Sentry.captureException(error);
    Sentry.flush(2000).then(() => process.exit(1));
  });
}

export { Sentry };
