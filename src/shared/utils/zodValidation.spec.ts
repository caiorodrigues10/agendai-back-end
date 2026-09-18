/// <reference types="vitest/globals" />
import { z, ZodError } from "zod";
import { appErrorFromZod, formatZodIssues, isZodError } from "./zodValidation";

describe("zodValidation", () => {
  it("maps Zod issues to field/message without leaking issues array", () => {
    let caught: ZodError | undefined;
    try {
      z.object({ barbershopId: z.string().uuid() }).parse({ barbershopId: "nope" });
    } catch (error) {
      caught = error as ZodError;
    }
    expect(caught).toBeInstanceOf(ZodError);
    const mapped = formatZodIssues(caught!);
    expect(mapped).toEqual([
      expect.objectContaining({ field: "barbershopId", message: expect.any(String) }),
    ]);
    expect(mapped[0]).not.toHaveProperty("code");
    expect(mapped[0]).not.toHaveProperty("path");
    expect(isZodError(caught)).toBe(true);
  });

  it("wraps ZodError as AppError 400 Dados inválidos", () => {
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["date"],
        message: "Required",
      },
    ]);
    const appError = appErrorFromZod(zodError);
    expect(appError.statusCode).toBe(400);
    expect(appError.message).toBe("Dados inválidos");
    expect(appError.errors).toEqual([{ field: "date", message: "Required" }]);
  });
});
