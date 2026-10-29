import { describe, expect, it } from "vitest";
import {
  availableFields,
  detectColumns,
  getFieldLabel,
  invertColumnMapping,
  normalizeHeaderText,
  toColumnMap,
} from "./columnMapping";

describe("normalizeHeaderText", () => {
  it("minúsculas, sem acento e sem pontuação", () => {
    expect(normalizeHeaderText("Data do Atendimento")).toBe("data do atendimento");
    expect(normalizeHeaderText("Telefone/WhatsApp")).toBe("telefone whatsapp");
    expect(normalizeHeaderText("Valor (R$)")).toBe("valor r");
  });
});

describe("detectColumns", () => {
  it("detecta colunas de cliente por sinônimo", () => {
    const detected = detectColumns(["Nome do Cliente", "WhatsApp", "E-mail"], "CLIENTS");
    expect(detected.name).toBe(0);
    expect(detected.whatsapp).toBe(1);
  });

  it("detecta por casamento parcial", () => {
    const detected = detectColumns(["Data do Agendamento", "Horário", "Serviço"], "APPOINTMENTS");
    expect(detected.date).toBe(0);
    expect(detected.time).toBe(1);
    expect(detected.serviceName).toBe(2);
  });

  it("ignora acento e caixa", () => {
    const detected = detectColumns(["TELEFONE", "Nome"], "CLIENTS");
    expect(detected.whatsapp).toBe(0);
    expect(detected.name).toBe(1);
  });

  it("não usa a mesma coluna para dois campos", () => {
    const detected = detectColumns(["Contato"], "CLIENTS");
    const usados = Object.values(detected);
    expect(new Set(usados).size).toBe(usados.length);
  });

  it("não oferece campo de caso fora do segmento de advocacia", () => {
    const detected = detectColumns(["Processo", "Área"], "APPOINTMENTS", "BARBERSHOP");
    expect(detected.caseName).toBeUndefined();
    expect(detected.practiceArea).toBeUndefined();
  });

  it("oferece campo de caso no segmento de advocacia", () => {
    const detected = detectColumns(["Processo", "Área de atuação"], "APPOINTMENTS", "LAW_FIRM");
    expect(detected.caseName).toBe(0);
    expect(detected.practiceArea).toBe(1);
  });
});

describe("availableFields", () => {
  it("filtra campos de caso para segmento sem perfil auxiliar", () => {
    const fields = availableFields("APPOINTMENTS", "BARBERSHOP");
    expect(fields.some((field) => field.key === "caseName")).toBe(false);
  });

  it("mantém campos de caso no segmento de advocacia", () => {
    const fields = availableFields("APPOINTMENTS", "LAW_FIRM");
    expect(fields.some((field) => field.key === "caseName")).toBe(true);
  });
});

describe("getFieldLabel", () => {
  it("usa o vocabulário do segmento", () => {
    const fields = availableFields("CLIENTS", "PETSHOP");
    const nome = fields.find((field) => field.key === "name")!;
    // No pet shop o "cliente" do CRM é o tutor.
    expect(getFieldLabel(nome, "PETSHOP")).toBe("tutor(a)");
  });
});

describe("mapeamento de colunas", () => {
  it("inverte e volta o mapa sem perder informação", () => {
    const inverted = invertColumnMapping({ "0": "name", "2": "whatsapp" });
    expect(inverted).toEqual({ name: 0, whatsapp: 2 });
    expect(toColumnMap(inverted)).toEqual({ "0": "name", "2": "whatsapp" });
  });

  it("descarta índice inválido", () => {
    const inverted = invertColumnMapping({ "-1": "name", "x": "whatsapp" });
    expect(inverted).toEqual({});
  });
});
