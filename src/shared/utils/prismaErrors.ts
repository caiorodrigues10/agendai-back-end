import { Prisma } from "@prisma/client";

const INVALID_IDENTIFIER_CODES = new Set(["P2023"]);

function errorMessage(error: unknown): string {
  if (typeof (error as { message?: unknown })?.message === "string") {
    return (error as { message: string }).message;
  }
  return "";
}

/** Prisma / Postgres invalid UUID (or similar identifier) — map to 400, never echo SQL. */
export function isPrismaInvalidUuidError(error: unknown): boolean {
  try {
    const code =
      typeof (error as { code?: unknown })?.code === "string"
        ? (error as { code: string }).code
        : "";

    if (INVALID_IDENTIFIER_CODES.has(code)) return true;

    const KnownError = Prisma.PrismaClientKnownRequestError;
    if (typeof KnownError === "function" && error instanceof KnownError && INVALID_IDENTIFIER_CODES.has(error.code)) {
      return true;
    }

    const message = errorMessage(error).toLowerCase();
    return (
      message.includes("invalid input syntax for type uuid") ||
      message.includes("error creating uuid")
    );
  } catch {
    return false;
  }
}
