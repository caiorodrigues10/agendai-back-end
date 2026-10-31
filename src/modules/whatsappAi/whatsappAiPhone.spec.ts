import { describe, expect, it } from "vitest";
import { aiPhoneCandidates, canonicalAiPhone, maskAiPhone } from "./whatsappAiPhone";

const LOCAL = "11988887777";
const CANONICAL = "5511988887777";

describe("canonicalAiPhone", () => {
  it("acrescenta o DDI 55 em número local", () => {
    expect(canonicalAiPhone(LOCAL)).toBe(CANONICAL);
  });

  it("mantém número já internacional", () => {
    expect(canonicalAiPhone(CANONICAL)).toBe(CANONICAL);
  });

  it("ignora pontuação e espaços", () => {
    expect(canonicalAiPhone("(11) 98888-7777")).toBe(CANONICAL);
    expect(canonicalAiPhone("+55 11 98888 7777")).toBe(CANONICAL);
  });

  it("devolve vazio para entrada inválida", () => {
    expect(canonicalAiPhone("abc")).toBe("");
    expect(canonicalAiPhone("")).toBe("");
    expect(canonicalAiPhone(null)).toBe("");
    expect(canonicalAiPhone(undefined)).toBe("");
  });
});

describe("aiPhoneCandidates", () => {
  it("inclui a versão com e sem o DDI 55", () => {
    const candidates = aiPhoneCandidates(LOCAL);
    expect(candidates).toContain(CANONICAL);
    expect(candidates).toContain(LOCAL);
  });

  it("inclui os dígitos crus quando o formato difere", () => {
    expect(aiPhoneCandidates("(11) 98888-7777")).toContain(LOCAL);
  });

  it("não duplica o mesmo valor", () => {
    const candidates = aiPhoneCandidates(CANONICAL);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates).toContain(CANONICAL);
  });

  it("não remove o prefixo de um número internacional curto", () => {
    const candidates = aiPhoneCandidates("+1 415 555 2671");
    expect(candidates).toContain("14155552671");
    expect(candidates).not.toContain("4155552671");
  });

  it("devolve lista vazia para entrada inválida", () => {
    expect(aiPhoneCandidates("abc")).toEqual([]);
    expect(aiPhoneCandidates(null)).toEqual([]);
  });
});

describe("maskAiPhone", () => {
  it("nunca expõe o número completo", () => {
    const masked = maskAiPhone(CANONICAL);
    expect(masked).not.toContain(CANONICAL);
    expect(masked.endsWith("7777")).toBe(true);
  });

  it("mascara número curto", () => {
    expect(maskAiPhone("12")).toBe("**");
  });
});
