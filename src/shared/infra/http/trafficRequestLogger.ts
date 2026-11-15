/**
 * Request-log serializer with a privacy exception for the anonymous beacon.
 *
 * Fastify's default request serializer includes the URL, host, client IP and
 * remote port. The beacon contract promises that request data is not logged,
 * so `/api/ping` is reduced to the HTTP method only. All other routes retain
 * Fastify's normal metadata.
 */

export const TRAFFIC_BEACON_PATH = "/api/ping";

interface RequestLogMetadata {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
  raw?: { url?: string; socket?: { remotePort?: number } };
}

function isBeaconUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url === TRAFFIC_BEACON_PATH || url.startsWith(`${TRAFFIC_BEACON_PATH}?`);
}

/**
 * Serialize a request for Fastify/Pino while redacting beacon metadata.
 * Exported for a focused regression test and for reuse by the app logger.
 */
export function trafficRequestSerializer(
  request: RequestLogMetadata,
): Record<string, unknown> {
  if (isBeaconUrl(request.url ?? request.raw?.url)) {
    // Do not include URL, host, IP or port for the beacon.
    return { method: request.method ?? "POST" };
  }

  return {
    method: request.method,
    url: request.url,
    version:
      request.headers && typeof request.headers === "object"
        ? (request.headers as Record<string, unknown>)["accept-version"]
        : undefined,
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort ?? request.raw?.socket?.remotePort,
  };
}
