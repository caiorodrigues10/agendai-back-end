/// <reference types="vitest/globals" />
import { shouldRunCrons } from "./processRole";

describe("papel de processo", () => {
  it("registra crons apenas no scheduler (ou all)", () => {
    expect(shouldRunCrons("scheduler")).toBe(true);
    expect(shouldRunCrons("all")).toBe(true);
    expect(shouldRunCrons("api")).toBe(false);
    expect(shouldRunCrons("worker")).toBe(false);
  });
});
