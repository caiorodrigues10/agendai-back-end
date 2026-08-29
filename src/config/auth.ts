export interface AuthConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

function validateAuthConfig(): AuthConfig {
  const secret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "JWT_SECRET não configurado ou muito curto (mínimo 32 caracteres). Defina uma secret forte nas variáveis de ambiente."
    );
  }

  if (!refreshSecret || refreshSecret.trim().length < 32) {
    throw new Error(
      "JWT_REFRESH_SECRET não configurado ou muito curto (mínimo 32 caracteres). Defina uma secret forte nas variáveis de ambiente."
    );
  }

  return {
    secret,
    refreshSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    // O refresh token é a sessão de longa duração usada por "Manter conectado".
    // Sessões sem essa opção continuam sendo descartadas quando o navegador fecha.
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  };
}

const authConfig = validateAuthConfig();

export default authConfig;
