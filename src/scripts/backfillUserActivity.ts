import { disconnectPrisma } from "@/libs/prismaClient";
import { backfillUserActivityDaily } from "@/modules/traffic/infra/backfillUserActivity";

function monthsFromArgs(): number {
  const value = process.argv.find((arg) => arg.startsWith("--months="))?.split("=")[1];
  if (!value) return 6;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new Error("--months must be an integer between 1 and 12");
  }
  return parsed;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const months = monthsFromArgs();
  const anchor = new Date();
  console.info(
    `[traffic:user-activity-backfill] starting months=${months} anchor=${anchor.toISOString()}`,
  );

  const results = await backfillUserActivityDaily(anchor, {
    months,
    onBatch: (result) => {
      console.info(
        `[traffic:user-activity-backfill] batch ${result.from.toISOString()}..${result.to.toISOString()} inserted=${result.inserted} elapsedMs=${Date.now() - startedAt}`,
      );
    },
  });

  const inserted = results.reduce((total, result) => total + result.inserted, 0);
  console.info(
    `[traffic:user-activity-backfill] completed batches=${results.length} inserted=${inserted} totalMs=${Date.now() - startedAt}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "[traffic:user-activity-backfill] failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
