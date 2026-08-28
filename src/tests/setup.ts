import "reflect-metadata";

process.env.JWT_SECRET = "test-secret-key-that-is-at-least-32-chars-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-that-is-at-least-32-chars-long";
process.env.JWT_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.ASAAS_WEBHOOK_TOKEN = "test-webhook-token-that-is-at-least-32-chars-long";
process.env.ALLOW_INSECURE_WEBHOOKS = "true";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";
