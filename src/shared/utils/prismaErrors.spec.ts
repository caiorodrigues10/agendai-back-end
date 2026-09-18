/// <reference types="vitest/globals" />
import { Prisma } from "@prisma/client";
import { isPrismaInvalidUuidError } from "./prismaErrors";

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
