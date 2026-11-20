export function looksLikeProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  databaseUrl: string = env.DATABASE_URL ?? "",
): boolean {
  if (env.NODE_ENV === "production") return true;
  try {
    const url = new URL(databaseUrl);
    const dbName = url.pathname.replace(/^\//, "");
    if (/prod/i.test(dbName)) return true;
    if (/prod/i.test(url.hostname)) return true;
  } catch {
    // URL inválida: não conclusivo, não bloqueia por aqui.
  }
  return false;
}
