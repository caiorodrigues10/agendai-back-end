/**
 * Storage health status utility.
 *
 * Reports which storage provider is active without making network calls
 * (just checks configuration state). Used by the health check endpoint.
 */

export type StorageHealthStatus = {
  /** Overall storage health: 'ok' if at least one provider works, 'degraded' if none */
  status: 'ok' | 'degraded';
  /** Which provider is effectively handling uploads right now */
  active_provider: 'gcs' | 'cloudinary' | 'none';
  /** Whether the primary provider (GCS) is available */
  primary_available: boolean;
  /** Whether the fallback provider (Cloudinary) is available */
  fallback_available: boolean;
};

function isGcsConfigured(): boolean {
  return Boolean(
    process.env.GCS_KEY_FILE_PATH ||
    process.env.GCS_CREDENTIALS_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Returns storage health status based on provider configuration.
 * Does NOT make network calls — only checks env vars.
 *
 * Logic:
 * - GCS configured → primary_available: true, active_provider: 'gcs'
 * - GCS not configured + Cloudinary configured → fallback_available: true, active_provider: 'cloudinary'
 * - Neither configured → active_provider: 'none', status: 'degraded'
 */
export function getStorageHealthStatus(): StorageHealthStatus {
  const gcsConfigured = isGcsConfigured();
  const cloudinaryConfigured = isCloudinaryConfigured();

  // GCS is the primary — if configured, it's "available" (even if billing
  // is disabled, the FallbackStorageProvider handles that transparently)
  const primary_available = gcsConfigured;
  const fallback_available = cloudinaryConfigured;

  let active_provider: 'gcs' | 'cloudinary' | 'none';
  if (gcsConfigured) {
    active_provider = 'gcs';
  } else if (cloudinaryConfigured) {
    active_provider = 'cloudinary';
  } else {
    active_provider = 'none';
  }

  const status: 'ok' | 'degraded' = active_provider === 'none' ? 'degraded' : 'ok';

  return {
    status,
    active_provider,
    primary_available,
    fallback_available,
  };
}
