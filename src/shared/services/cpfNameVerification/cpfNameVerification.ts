/**
 * Feature flag para verificação de correspondência CPF × nome.
 *
 * Controlada pela env `CPF_NAME_VERIFICATION`:
 * - off: não chama o verificador (padrão).
 * - warn: chama e loga aviso em caso de mismatch, mas não bloqueia.
 * - enforce: chama e bloqueia o cadastro em caso de mismatch.
 */
export type CpfNameVerificationMode = "off" | "warn" | "enforce";

export function cpfNameVerificationMode(): CpfNameVerificationMode {
  const raw = (process.env.CPF_NAME_VERIFICATION || "off") as CpfNameVerificationMode;
  if (raw !== "off" && raw !== "warn" && raw !== "enforce") return "off";
  return raw;
}

export function isCpfNameVerificationEnabled(): boolean {
  return cpfNameVerificationMode() !== "off";
}

import { container } from "tsyringe";
import { ICpfNameVerifier } from "./ICpfNameVerifier";
import { NoopCpfNameVerifier } from "./NoopCpfNameVerifier";

/**
 * Constrói o verificador de CPF × nome. Por enquanto só existe o adaptador
 * noop; provedores reais podem ser adicionados aqui no futuro.
 */
export function buildCpfNameVerifier(): ICpfNameVerifier {
  return new NoopCpfNameVerifier();
}

container.registerSingleton<ICpfNameVerifier>("CpfNameVerifier", NoopCpfNameVerifier);
