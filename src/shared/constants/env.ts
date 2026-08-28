export const DEFAULT_FRONTEND_URL = "http://localhost:3003";

export function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/$/, "");
}
