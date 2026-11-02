/**
 * Porta de verificação de correspondência entre CPF e nome do titular.
 *
 * Um provedor real (ex.: consulta a receita/open finance) seria implementado
 * como outra classe deste contrato. Enquanto não houver provedor, usa-se o
 * adaptador noop, que retorna "unavailable" (não verificado).
 */
export interface ICpfNameVerifier {
  verify(input: {
    cpf: string;
    name: string;
  }): Promise<{ status: "match" | "mismatch" | "unavailable" }>;
}
