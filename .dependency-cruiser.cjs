/**
 * Dependency-Cruiser — guarda de arquitetura (Fase 0 do plano Clean Architecture).
 *
 * Três frentes:
 *  1. Dívida conhecida (severity: "warn") — reproduz o baseline medido na Fase 0
 *     (docs/architecture/baseline.md): Prisma runtime em use cases/controllers e
 *     ciclos. Warning mantém o gate verde enquanto a dívida existe; zerar é a
 *     meta das Fases 1–2.
 *  2. Regras da arquitetura alvo (severity: "error") — camadas domain/
 *     application/ presentation/ ainda não existem, então hoje são vacías; elas
 *     ativam sozinhas no primeiro PR que cria as camadas e impedem "mover sem
 *     refatorar" (ex.: controller em presentation/ ainda importando Prisma).
 *  3. Sem exclusion de specs nas regras de dívida? Não: specs são excluídas via
 *     pathNot porque o baseline contabiliza apenas código de produção
 *     (78 use cases / 28 controllers — ver baseline.md).
 *
 * Rodar: npm run architecture:check
 */
module.exports = {
  forbidden: [
    // ── Dívida conhecida (baseline Fase 0 — warn até zerar) ──────────────────
    {
      name: "no-prisma-runtime-in-use-cases",
      severity: "warn",
      comment:
        "Use cases (application layer) must talk to the database through a " +
        "repository port, never the Prisma runtime. Debt from the Fase 0 " +
        "baseline (docs/architecture/baseline.md) — target: 0.",
      from: {
        path: "^src/modules/[^/]+/useCases/",
        pathNot: ["\\.spec\\.ts$"],
      },
      to: {
        path: "^src/libs/prismaClient\\.ts$",
      },
    },
    {
      name: "no-prisma-runtime-in-controllers",
      severity: "warn",
      comment:
        "Controllers (presentation layer) must not touch the Prisma runtime — " +
        "go through the use case. Debt from the Fase 0 baseline " +
        "(docs/architecture/baseline.md) — target: 0.",
      from: {
        path: "^src/modules/.*/controllers/",
        pathNot: ["\\.spec\\.ts$"],
      },
      to: {
        path: "^src/libs/prismaClient\\.ts$",
      },
    },
    {
      name: "no-circular",
      severity: "warn",
      comment:
        "Circular dependency. Debt from the Fase 0 baseline " +
        "(docs/architecture/baseline.md) — target: 0 (Fases 1–2).",
      from: {},
      to: {
        circular: true,
      },
    },

    // ── Arquitetura alvo (error — vacías até a Fase 1 criar as camadas) ─────
    {
      name: "clean-architecture-pure-layers",
      severity: "error",
      comment:
        "domain/ and application/ are pure: no Prisma runtime, no Fastify, no " +
        "Redis/BullMQ. Allowed: `import type` and enums from @prisma/client.",
      from: {
        path: "^src/modules/[^/]+/(domain|application)/",
      },
      to: {
        path: [
          "^src/libs/prismaClient\\.ts$",
          "^fastify($|/)",
          "^@fastify/",
          "^ioredis($|/)",
          "^redis($|/)",
          "^bullmq($|/)",
        ],
      },
    },
    {
      name: "clean-architecture-presentation-via-di",
      severity: "error",
      comment:
        "presentation/ reaches persistence only through application ports + " +
        "DI container — never the Prisma runtime directly.",
      from: {
        path: "^src/modules/[^/]+/presentation/",
      },
      to: {
        path: "^src/libs/prismaClient\\.ts$",
      },
    },
    {
      name: "clean-architecture-no-cross-layer-infra",
      severity: "error",
      comment:
        "presentation/ and application/ must not import infrastructure " +
        "adapters (own module or another) directly — wire them in the container.",
      from: {
        path: "^src/modules/[^/]+/(presentation|application)/",
      },
      to: {
        path: "^src/modules/[^/]+/infra/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    exclude: {
      path: "^(dist|spikes)/",
    },
  },
};
