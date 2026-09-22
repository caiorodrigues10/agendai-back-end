import { Prisma } from "@prisma/client";
import { AppError } from "@/shared/errors/AppError";

const INVALID_IDENTIFIER_CODES = new Set(["P2023"]);

const UNIQUE_FIELD_MESSAGES = {
  email: "E-mail já cadastrado",
  googleSub: "Esta conta Google já está cadastrada",
  cpf: "CPF já cadastrado",
} as const;

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

function isUniqueConstraintError(error: unknown): boolean {
  try {
    if (
      typeof (error as { code?: unknown })?.code === "string" &&
      (error as { code: string }).code === "P2002"
    ) {
      return true;
    }
    const KnownError = Prisma.PrismaClientKnownRequestError;
    return (
      typeof KnownError === "function" &&
      error instanceof KnownError &&
      error.code === "P2002"
    );
  } catch {
    return false;
  }
}

function uniqueConstraintTarget(error: unknown): string {
  try {
    const target = (error as { meta?: { target?: unknown } })?.meta?.target;
    if (Array.isArray(target)) {
      return target.map(String).join(" ").toLowerCase();
    }
    if (typeof target === "string") {
      return target.toLowerCase();
    }
    return "";
  } catch {
    return "";
  }
}

/** Maps Prisma P2002 (unique constraint) to a domain AppError, or null if not P2002. */
export function mapUniqueConstraintError(error: unknown): AppError | null {
  if (!isUniqueConstraintError(error)) return null;

  const target = uniqueConstraintTarget(error);
  if (target.includes("email")) {
    return new AppError(UNIQUE_FIELD_MESSAGES.email, 400);
  }
  if (target.includes("googlesub")) {
    return new AppError(UNIQUE_FIELD_MESSAGES.googleSub, 400);
  }
  if (target.includes("cpf")) {
    return new AppError(UNIQUE_FIELD_MESSAGES.cpf, 400);
  }
  return new AppError("Registro duplicado", 409);
}
