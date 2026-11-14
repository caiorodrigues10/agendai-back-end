/**
 * Barrel do módulo `addons` (FASE 2 — catálogo + domínio).
 * Camadas: domain (puro) → application (portas/use cases) →
 * infrastructure (Prisma) → presentation (Fastify).
 */
export * from "./domain/money";
export * from "./domain/addonTypes";
export * from "./domain/appointmentAddonTotals";
export * from "./domain/validateAddonSelection";
export {
  AddonCatalogUseCases,
  SALON_ADDON_REPOSITORY,
  SERVICE_ADDON_LINK_REPOSITORY,
} from "./application/addonCatalogUseCases";
export type * from "./application/ports";
export { PrismaSalonAddonRepository } from "./infrastructure/prismaSalonAddonRepository";
export { PrismaServiceAddonLinkRepository } from "./infrastructure/prismaServiceAddonLinkRepository";
export { AddonCatalogController } from "./presentation/addonCatalogController";
export { addonCatalogRoutes } from "./presentation/addonCatalogRoutes";
