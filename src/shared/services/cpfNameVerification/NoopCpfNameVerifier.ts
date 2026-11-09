import { injectable } from "tsyringe";
import { ICpfNameVerifier } from "./ICpfNameVerifier";

/**
 * Adaptador sem provedor real: nunca consegue verificar, então retorna
 * "unavailable". Não bloqueia o cadastro por si só; a decisão de bloquear ou
 * apenas avisar cabe à feature flag (ver cpfNameVerification.ts).
 *
 * CPF e nome nunca são logados neste adaptador (ver regras de privacidade).
 */
@injectable()
export class NoopCpfNameVerifier implements ICpfNameVerifier {
  async verify(): Promise<{ status: "match" | "mismatch" | "unavailable" }> {
    return { status: "unavailable" };
  }
}
