/**
 * Ajuda dos testes dos processadores de importação.
 *
 * Os processadores recebem o cliente transacional do Prisma (`AppTx`), que
 * tem dezenas de delegates. Nos testes só alguns delegates são usados: o
 * mock é montado parcial e convertido aqui, num único lugar — sem `as any`
 * nem `as unknown as` espalhado pelos testes.
 */
import type { AppTx } from "@/libs/prismaClient";

/** Converte um mock parcial de transação no `AppTx` esperado pelos processadores. */
export function txDeTeste(mock: unknown): AppTx {
  return mock as AppTx;
}
