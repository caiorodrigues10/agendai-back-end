import { describe, expect, it } from "vitest";
import {
  buildAiResponse,
  formatAiPrice,
  formatAiSchedule,
  matchAiService,
} from "./whatsappAiResponses";
import type { AiSalonContext } from "./whatsappAi.types";

const salon: AiSalonContext = {
  id: "shop-1",
  name: "Studio Marina",
  whatsapp: "55119999999999",
  address: "Rua das Flores, 120 - Centro",
  city: "São Paulo",
  latitude: -23.5505,
  longitude: -46.6333,
  timezone: "America/Sao_Paulo",
  businessSegment: "HAIR_SALON",
  openingMode: "SCHEDULE",
  manualStatus: "AUTO",
  schedules: [
    { dayOfWeek: 0, isOpen: false, openTime: "00:00", closeTime: "00:00" },
    { dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 2, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 3, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 4, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 5, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: 6, isOpen: true, openTime: "09:00", closeTime: "18:00" },
  ],
  services: [
    { name: "Corte de cabelo", price: 60, avgTimeMinutes: 40 },
    { name: "Barba", price: 35, avgTimeMinutes: 25 },
  ],
};

describe("formatAiSchedule", () => {
  it("agrupa dias consecutivos com o mesmo horário", () => {
    const lines = formatAiSchedule(salon.schedules);
    expect(lines).toContain("Seg a Sex: 9h às 20h");
    expect(lines).toContain("Sábado: 9h às 18h");
    expect(lines).not.toContain("Dom");
  });

  it("devolve lista vazia sem grade cadastrada", () => {
    expect(formatAiSchedule([])).toEqual([]);
  });
});

describe("formatAiPrice", () => {
  it("formata em real", () => {
    expect(formatAiPrice(60)).toContain("60");
    expect(formatAiPrice(Number.NaN)).toBe("a combinar");
  });
});

describe("matchAiService", () => {
  it("acha o serviço citado no texto", () => {
    expect(matchAiService("quanto custa o corte de cabelo?", salon.services)?.name).toBe(
      "Corte de cabelo"
    );
  });

  it("prefere o nome mais longo", () => {
    const services = [
      { name: "Corte", price: 40, avgTimeMinutes: 30 },
      { name: "Corte de cabelo", price: 60, avgTimeMinutes: 40 },
    ];
    expect(matchAiService("corte de cabelo", services)?.name).toBe("Corte de cabelo");
  });

  it("devolve null quando nenhum serviço é citado", () => {
    expect(matchAiService("oi", salon.services)).toBeNull();
  });
});

describe("buildAiResponse", () => {
  it("responde horário com a grade real do salão", () => {
    const reply = buildAiResponse({ intent: "hours", salon });
    expect(reply).toContain("Seg a Sex: 9h às 20h");
    expect(reply).not.toContain("Rua Principal");
  });

  it("avisa quando o salão está fechado manualmente", () => {
    const reply = buildAiResponse({
      intent: "hours",
      salon: { ...salon, manualStatus: "CLOSED" },
    });
    expect(reply).toContain("fechados");
  });

  it("responde endereço com o endereço cadastrado", () => {
    const reply = buildAiResponse({ intent: "location", salon });
    expect(reply).toContain("Rua das Flores, 120 - Centro");
    expect(reply).toContain("São Paulo");
    expect(reply).toContain("google.com/maps");
  });

  it("avisa quando não há endereço cadastrado", () => {
    const reply = buildAiResponse({
      intent: "location",
      salon: { ...salon, address: null, city: null, latitude: null, longitude: null },
    });
    expect(reply).toContain("endereço cadastrado");
    expect(reply).not.toContain("Rua das Flores");
  });

  it("responde preços com os serviços cadastrados", () => {
    const reply = buildAiResponse({ intent: "pricing", salon });
    expect(reply).toContain("Corte de cabelo");
    expect(reply).toContain("Barba");
  });

  it("destaca o serviço citado na mensagem", () => {
    const reply = buildAiResponse({
      intent: "pricing",
      salon,
      message: "quanto custa a barba?",
    });
    expect(reply.indexOf("Barba")).toBeLessThan(reply.indexOf("Corte de cabelo"));
  });

  it("pede serviço, dia e período no agendamento", () => {
    const reply = buildAiResponse({ intent: "scheduling", salon });
    expect(reply).toContain("Serviço");
    expect(reply).toContain("Dia");
    expect(reply).toContain("Período");
  });

  it("saúda usando o nome do salão", () => {
    expect(buildAiResponse({ intent: "greeting", salon })).toContain("Studio Marina");
  });

  it("oferece atendente quando não entende", () => {
    const reply = buildAiResponse({ intent: "unknown", salon });
    expect(reply).toContain("atendente");
  });

  it("avisa quando não há tabela de preços cadastrada", () => {
    const reply = buildAiResponse({ intent: "pricing", salon: { ...salon, services: [] } });
    expect(reply).toContain("ainda não foi cadastrada");
  });
});
