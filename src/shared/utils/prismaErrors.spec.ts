/// <reference types="vitest/globals" />
import { Prisma } from "@prisma/client";
import { AppError } from "@/shared/errors/AppError";
import { isPrismaInvalidUuidError, mapUniqueConstraintError } from "./prismaErrors";

describe("isPrismaInvalidUuidError", () => {
  it("detects Prisma P2023", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Inconsistent column data: invalid input syntax for type uuid: "abc"',
      { code: "P2023", clientVersion: "6.4.0" },
    );
    expect(isPrismaInvalidUuidError(error)).toBe(true);
  });

  it("detects postgres invalid uuid text without requiring P2023", () => {
    expect(
      isPrismaInvalidUuidError(new Error('invalid input syntax for type uuid: "not-a-uuid"')),
    ).toBe(true);
  });

  it("does not treat unrelated Prisma codes as invalid UUID", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.4.0",
    });
    expect(isPrismaInvalidUuidError(error)).toBe(false);
  });
});

describe("mapUniqueConstraintError", () => {
  function p2002(target: string | string[]) {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.4.0",
      meta: { target },
    });
  }

  it("maps email constraint to E-mail já cadastrado", () => {
    const mapped = mapUniqueConstraintError(p2002(["email"]));
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.message).toBe("E-mail já cadastrado");
    expect(mapped?.statusCode).toBe(400);
  });

  it("maps users_email_key constraint name", () => {
    const mapped = mapUniqueConstraintError(p2002("users_email_key"));
    expect(mapped?.message).toBe("E-mail já cadastrado");
  });

  it("maps googleSub constraint (case-insensitive)", () => {
    const mapped = mapUniqueConstraintError(p2002(["googleSub"]));
    expect(mapped?.message).toBe("Esta conta Google já está cadastrada");
    expect(mapped?.statusCode).toBe(400);
  });

  it("maps users_googlesub_key constraint name", () => {
    const mapped = mapUniqueConstraintError(p2002("users_googleSub_key"));
    expect(mapped?.message).toBe("Esta conta Google já está cadastrada");
  });

  it("maps cpf constraint to CPF já cadastrado", () => {
    const mapped = mapUniqueConstraintError(p2002(["cpf"]));
    expect(mapped?.message).toBe("CPF já cadastrado");
    expect(mapped?.statusCode).toBe(400);
  });

  it("maps unknown unique target to generic 409", () => {
    const mapped = mapUniqueConstraintError(p2002(["token"]));
    expect(mapped?.message).toBe("Registro duplicado");
    expect(mapped?.statusCode).toBe(409);
  });

  it("returns null for non-P2002 errors", () => {
    expect(mapUniqueConstraintError(new Error("boom"))).toBeNull();
    expect(
      mapUniqueConstraintError(
        new Prisma.PrismaClientKnownRequestError("Failed", {
          code: "P2023",
          clientVersion: "6.4.0",
        }),
      ),
    ).toBeNull();
  });

  it("returns null when P2002 has no meta target", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.4.0",
    });
    const mapped = mapUniqueConstraintError(error);
    expect(mapped?.message).toBe("Registro duplicado");
    expect(mapped?.statusCode).toBe(409);
  });
});
