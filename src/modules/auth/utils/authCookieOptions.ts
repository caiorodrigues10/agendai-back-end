import type { CookieSerializeOptions } from "@fastify/cookie";

type AuthCookieSecurityOptions = Pick<
  CookieSerializeOptions,
  "httpOnly" | "secure" | "sameSite" | "partitioned" | "path"
>;

/** Configuração segura do cookie de renovação para frontend e API cross-site. */
export function getAuthCookieSecurityOptions(): AuthCookieSecurityOptions {
  const isProduction = process.env.NODE_ENV === "production";
  const configured = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
  const sameSite =
    configured === "strict" || configured === "lax" || configured === "none"
      ? configured
      : isProduction
        ? "none"
        : "lax";
  const crossSite = sameSite === "none";

  return {
    httpOnly: true,
    secure: isProduction || crossSite,
    sameSite,
    partitioned: crossSite,
    path: "/api/auth",
  };
}
