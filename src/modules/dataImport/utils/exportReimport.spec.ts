/**
 * Round trip exportação → importação, com funções puras.
 *
 * O que o dono exporta tem de voltar pelo mesmo assistente: os cabeçalhos
 * das abas de exportação são reconhecidos pelo `detectColumns` (o mesmo que
 * sugere o mapa quando o dono importa uma planilha).
 *
 * O teste usa os cabeçalhos **reais** das abas de exportação — não uma cópia
 * no teste: se a exportação mudar o cabeçalho, este teste avisa.
 */
import { describe, it, expect } from "vitest";
import {
  APPOINTMENT_COLUMNS,
  CLIENT_COLUMNS,
  SERVICE_COLUMNS,
} from "@/modules/dataExport/builders/sheets/operationSheets";
import {
  CLIENT_PACKAGE_COLUMNS,
  FIADO_COLUMNS,
  PACKAGE_COLUMNS,
  PRODUCT_COLUMNS,
} from "@/modules/dataExport/builders/sheets/commerceSheets";
import {
  CASE_FEES_COLUMNS,
  CASES_COLUMNS,
} from "@/modules/dataExport/builders/sheets/caseSheets";
import { availableFields, detectColumns } from "./columnMapping";
import type { ImportTargetType } from "../dataImport.types";

/** Aba de exportação → destino de importação correspondente. */
const ROUND_TRIP: Array<{
  aba: string;
  targetType: ImportTargetType;
  headers: string[];
}> = [
  {
    aba: "Clientes",
    targetType: "CLIENTS",
    headers: CLIENT_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Serviços",
    targetType: "SERVICES",
    headers: SERVICE_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Agendamentos",
    targetType: "APPOINTMENTS",
    headers: APPOINTMENT_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Produtos",
    targetType: "PRODUCTS",
    headers: PRODUCT_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Pacotes",
    targetType: "SERVICE_PACKAGES",
    headers: PACKAGE_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Pacotes dos clientes",
    targetType: "CLIENT_PACKAGES",
    headers: CLIENT_PACKAGE_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Fiado",
    targetType: "FIADOS",
    headers: FIADO_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Processos",
    targetType: "CASES",
    headers: CASES_COLUMNS.map((column) => column.header),
  },
  {
    aba: "Honorários de êxito",
    targetType: "CASE_FEES",
    headers: CASE_FEES_COLUMNS.map((column) => column.header),
  },
];

describe("round trip exportação → importação", () => {
  for (const item of ROUND_TRIP) {
    it(`os cabeçalhos da aba "${item.aba}" cobrem os campos obrigatórios de ${item.targetType}`, () => {
      const detected = detectColumns(item.headers, item.targetType, null);
      const obrigatorios = availableFields(item.targetType, null)
        .filter((field) => field.required)
        .map((field) => field.key);

      const faltando = obrigatorios.filter((field) => detected[field] === undefined);
      expect(faltando).toEqual([]);
    });
  }

  it("a aba de clientes é reconhecida nome, WhatsApp e observações", () => {
    const headers = CLIENT_COLUMNS.map((column) => column.header);
    const detected = detectColumns(headers, "CLIENTS", null);
    expect(headers[detected.name!]).toBe("Nome");
    expect(headers[detected.whatsapp!]).toBe("WhatsApp");
    expect(headers[detected.notes!]).toBe("Observações");
  });

  it("a aba de honorários reconhece o número do processo e o percentual", () => {
    const headers = CASE_FEES_COLUMNS.map((column) => column.header);
    const detected = detectColumns(headers, "CASE_FEES", null);
    expect(headers[detected.caseNumber!]).toBe("Número do processo");
    expect(headers[detected.percent!]).toBe("Percentual (%)");
  });
});
