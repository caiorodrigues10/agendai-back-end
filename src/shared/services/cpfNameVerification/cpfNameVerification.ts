/**
 * Feature flag para verificação de correspondência CPF × nome.
 *
 * Controlada pela env `CPF_NAME_VERIFICATION`:
 * - off: não chama o verificador (padrão).
 * - warn: chama e loga aviso em caso de mismatch, mas não bloqueia.
 * - enforce: chama e bloqueia o cadastro em caso de mismatch.
 *
 * O registro do adaptador (NoopCpfNameVerifier) fica em
 * src/shared/container/index.ts; este arquivo contém apenas a flag.
 */
export type CpfNameVerificationMode = "off" | "warn" | "enforce";

export function cpfNameVerificationMode(): CpfNameVerificationMode {
  const raw = (process.env.CPF_NAME_VERIFICATION || "off") as CpfNameVerificationMode;
  if (raw !== "off" && raw !== "warn" && raw !== "enforce") return "off";
  return raw;
}
