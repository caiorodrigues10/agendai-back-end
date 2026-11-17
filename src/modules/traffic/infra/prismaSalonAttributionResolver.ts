import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import {
  salonTargetKey,
  type SalonTrafficIdentifierType,
} from "../domain/salonTraffic";
import type {
  ISalonAttributionResolver,
  SalonTrafficAttribution,
} from "../application/ports/ISalonAttributionResolver";

/**
 * Resolução do identificador público do salão (`salon` + `salonType`).
 *
 * ⚠️ DECISÃO PENDENTE (contrato, "Resolução de id e slug"):
 * a opção 1 — **atribuir o ping à ORGANIZAÇÃO** — está implementada aqui:
 *   - `salonType:"id"`    → barbershop pelo UUID (resolução direta);
 *   - `salonType:"slug"`  → organização pelo slug (`organizations.slug`).
 *
 * A escolha está isolada neste adapter de propósito: trocar para a opção 2
 * (ignorar slug ambíguo) ou 3 (unidade principal) é uma mudança local, sem
 * tocar no contador, na consolidação ou no relatório.
 *
 * O slug NÃO identifica uma unidade: uma organização pode ter várias
 * barbearias e o link público `/s/<slug>` é da organização. Por isso o ping
 * vira `o:<organizationId>` (ver `salonTargetKey`) e a leitura do relatório
 * decide quem enxerga esse agregado (opção 1 do contrato: "apenas ao dono da
 * organização" — ver `GetSalonTrafficReportUseCase`).
 *
 * Privacidade: o identificador público nunca é gravado; só o UUID resolvido
 * (do salão ou da organização) vira chave de contagem.
 */
@injectable()
export class PrismaSalonAttributionResolver implements ISalonAttributionResolver {
  async resolve(
    salon: string,
    salonType: SalonTrafficIdentifierType,
  ): Promise<SalonTrafficAttribution | null> {
    try {
      if (salonType === "id") {
        const barbershop = await prisma.barbershop.findUnique({
          where: { id: salon },
          select: { id: true },
        });
        if (!barbershop) return null;
        return {
          kind: "barbershop",
          id: barbershop.id,
          target: salonTargetKey("barbershop", barbershop.id),
        };
      }

      const organization = await prisma.organization.findUnique({
        where: { slug: salon },
        select: { id: true },
      });
      if (!organization) return null;
      return {
        kind: "organization",
        id: organization.id,
        target: salonTargetKey("organization", organization.id),
      };
    } catch {
      // Identificador inexistente/indisponível → descarte silencioso.
      return null;
    }
  }
}
