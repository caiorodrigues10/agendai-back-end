import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';

/**
 * Sobe o SDK do OpenTelemetry (traces + `PrometheusExporter` em `:9464/metrics`).
 *
 * PRECISA rodar antes de qualquer módulo que exija `ioredis`, `pg` ou `fastify`:
 * os hooks de instrumentação (require-in-the-middle) só patcham os módulos
 * carregados DEPOIS do registro — um módulo já exigido nunca é instrumentado.
 * A ordem de boot é garantida por `telemetryBootstrap.ts`, importado antes dos
 * módulos que conectam.
 */
export function initTracing(): NodeSDK | null {
  if (process.env.OTEL_ENABLED !== 'true') {
    return null;
  }

  const prometheusExporter = new PrometheusExporter({
    port: parseInt(process.env.OTEL_PROMETHEUS_PORT || '9464', 10),
    endpoint: '/metrics',
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'agendai-backend',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
      new FastifyInstrumentation(),
      new DnsInstrumentation(),
    ],
    metricReader: prometheusExporter,
  });

  sdk.start();
  return sdk;
}