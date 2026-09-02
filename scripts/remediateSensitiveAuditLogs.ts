import "dotenv/config";
import { prisma } from "../src/libs/prismaClient";

const sensitiveRoutes = [
  "%/api/subscriptions%",
  "%/api/payments%",
  "%/api/auth/login%",
  "%/api/auth/register%",
  "%/api/auth/refresh%",
];

async function main() {
  const candidates = await prisma.auditLog.count({
    where: {
      details: { not: null },
      OR: sensitiveRoutes.map((pattern) => ({ action: { contains: pattern.replaceAll("%", "") } })),
    },
  });

  console.log(JSON.stringify({ candidates, valuesDisplayed: false, mode: process.argv.includes("--apply") ? "apply" : "dry-run" }));
  if (!process.argv.includes("--apply")) {
    console.log("Dry-run concluído. Faça backup e use --apply com CONFIRM_AUDIT_REMEDIATION=yes para limpar details.");
    return;
  }
  if (process.env.CONFIRM_AUDIT_REMEDIATION !== "yes") {
    throw new Error("Defina CONFIRM_AUDIT_REMEDIATION=yes após confirmar o backup.");
  }

  const result = await prisma.auditLog.updateMany({
    where: {
      details: { not: null },
      OR: sensitiveRoutes.map((pattern) => ({ action: { contains: pattern.replaceAll("%", "") } })),
    },
    data: { details: null },
  });
  console.log(JSON.stringify({ remediated: result.count, valuesDisplayed: false }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha na remediação");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
