import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

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
    beforeSend(event, hint) {
      const error = hint.originalException;
      if (error instanceof Error) {
        event.extra = {
          ...event.extra,
          errorName: error.name,
          errorStack: error.stack,
        };
      }
      return event;
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