import { describe, expect, it } from "vitest";
import {
  detectAiIntent,
  isHumanTransferRequest,
  normalizeAiText,
  shouldEscalate,
} from "./whatsappAiIntent";

describe("normalizeAiText", () => {
  it("baixa a caixa, tira acento e pontuação", () => {
    expect(normalizeAiText("  Horário, por favor!  ")).toBe("horario por favor");
  });
});

describe("detectAiIntent", () => {
  it("detecta saudação", () => {
    const result = detectAiIntent("oi, tudo bem?");
    expect(result.intent).toBe("greeting");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detecta 'boa noite' como saudação (e não pela letra 'oi' de 'noite')", () => {
    expect(detectAiIntent("boa noite").intent).toBe("greeting");
  });

  it("não trata palavra solta 'noite' como saudação", () => {
    expect(detectAiIntent("noite").intent).toBe("unknown");
  });

  it("detecta horário de funcionamento, e não agendamento", () => {
    const result = detectAiIntent("quero ver o horário de vocês");
    expect(result.intent).toBe("hours");
  });

  it("detecta agendamento", () => {
    expect(detectAiIntent("quero agendar um corte").intent).toBe("scheduling");
  });

  it("detecta remarcação", () => {
    expect(detectAiIntent("preciso remarcar meu horário").intent).toBe("reschedule");
  });

  it("detecta preço", () => {
    expect(detectAiIntent("quanto custa o corte?").intent).toBe("pricing");
  });

  it("detecta endereço", () => {
    expect(detectAiIntent("onde fica a loja?").intent).toBe("location");
  });

  it("detecta pedido de atendente humano", () => {
    expect(detectAiIntent("quero falar com um atendente").intent).toBe("human_transfer");
  });

  it("detecta despedida", () => {
    expect(detectAiIntent("valeu, tchau").intent).toBe("farewell");
  });

  it("devolve unknown com confiança baixa quando não entende", () => {
    const result = detectAiIntent("xyz abc def");
    expect(result.intent).toBe("unknown");
    expect(result.confidence).toBe(0.3);
  });

  it("ignora texto vazio", () => {
    expect(detectAiIntent("").intent).toBe("unknown");
    expect(detectAiIntent(null).intent).toBe("unknown");
  });

  it("reconhece 'reagendar' como remarcação", () => {
    expect(detectAiIntent("reagendar").intent).toBe("reschedule");
  });
});

describe("shouldEscalate", () => {
  it("escala quando a confiança é baixa", () => {
    expect(shouldEscalate(detectAiIntent("xyz"))).toBe(true);
  });

  it("escala quando o cliente pede atendente", () => {
    expect(shouldEscalate(detectAiIntent("quero um atendente"))).toBe(true);
  });

  it("não escala em pergunta respondível", () => {
    expect(shouldEscalate(detectAiIntent("qual o endereço?"))).toBe(false);
  });
});

describe("isHumanTransferRequest", () => {
  it("reconhece o pedido explícito de pessoa", () => {
    expect(isHumanTransferRequest("me passa um atendente, por favor")).toBe(true);
    expect(isHumanTransferRequest("qual o preço?")).toBe(false);
  });
});
