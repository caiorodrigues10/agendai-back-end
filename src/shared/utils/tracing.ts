import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';

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
      new RedisInstrumentation(),
      new FastifyInstrumentation(),
      new DnsInstrumentation(),
    ],
    metricReader: prometheusExporter,
  });

  sdk.start();
  return sdk;
}