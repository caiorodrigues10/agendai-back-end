/// <reference types="vitest/globals" />
import { getSegmentGate, isModuleEnabled, isTabEnabled } from "./segmentGate";

describe("segmentGate — gate genérico por segmento", () => {
  it("segmento sem configuração libera tudo", () => {
    expect(getSegmentGate("BARBERSHOP")).toEqual({ hiddenTabs: [], hiddenModules: [] });
    expect(isModuleEnabled("BARBERSHOP", "products")).toBe(true);
    expect(isTabEnabled("BARBERSHOP", "products")).toBe(true);
    expect(isModuleEnabled(null, "tip")).toBe(true);
  });

  it("LAW_FIRM oculta abas de produtos e equipamento", () => {
    expect(isTabEnabled("LAW_FIRM", "products")).toBe(false);
    expect(isTabEnabled("LAW_FIRM", "equipment")).toBe(false);
    expect(isTabEnabled("LAW_FIRM", "services")).toBe(true);
  });

  it("LAW_FIRM nega módulos de produtos, equipamento, comissões e gorjeta", () => {
    expect(isModuleEnabled("LAW_FIRM", "products")).toBe(false);
    expect(isModuleEnabled("LAW_FIRM", "equipment")).toBe(false);
    expect(isModuleEnabled("LAW_FIRM", "commissions")).toBe(false);
    expect(isModuleEnabled("LAW_FIRM", "tip")).toBe(false);
  });
});
