/**
 * Geração do modelo (.xlsx) para download.
 *
 * O modelo já vem com os cabeçalhos na ordem certa para o segmento do salão e
 * com uma linha de exemplo — o dono preenche e sobe. É a forma mais rápida
 * de o mapeamento automático acertar de primeira.
 */
import ExcelJS from "exceljs";
import { IMPORT_TEMPLATE_FILE_NAME } from "./dataImport.constants";
import type { ImportTargetType } from "./dataImport.types";
import { availableFields, getFieldLabel } from "./utils/columnMapping";
import type { BusinessSegment } from "@prisma/client";

/** Exemplo de preenchimento por campo (aparece na segunda linha do modelo). */
const EXAMPLES: Record<string, string> = {
  name: "Maria da Silva",
  whatsapp: "11987654321",
  birthDate: "12/05/1990",
  notes: "Cliente desde 2024",
  serviceName: "Corte de cabelo",
  price: "80,00",
  durationMinutes: "45",
  category: "Cabelo",
  description: "Corte social",
  date: "05/11/2026",
  time: "14:00",
  clientName: "Maria da Silva",
  clientWhatsapp: "11987654321",
  staffName: "João",
  status: "Confirmado",
  finalPrice: "80,00",
  paymentMethod: "Pix",
  modality: "Presencial",
  caseName: "Ação de cobrança",
  practiceArea: "Cível",
};

/** Monta o modelo .xlsx do alvo. */
export async function buildImportTemplate(
  targetType: ImportTargetType,
  segment?: BusinessSegment | null,
): Promise<{ fileName: string; buffer: Buffer }> {
  const fields = availableFields(targetType, segment);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Agendaí";
  workbook.created = new Date();

  const instructions = workbook.addWorksheet("Como preencher");
  instructions.columns = [
    { header: "Passo", key: "step", width: 8 },
    { header: "Orientação", key: "text", width: 90 },
  ];
  instructions.addRows([
    { step: 1, text: 'Preencha a aba "Dados" com uma linha por registro.' },
    { step: 2, text: "Não apague a primeira linha: ela é o cabeçalho com os nomes das colunas." },
    { step: 3, text: "Datas podem ser dd/mm/aaaa. Horas, hh:mm. Valores, 80 ou 80,00." },
    {
      step: 4,
      text:
        targetType === "CLIENTS"
          ? "O telefone identifica o cliente: quem já existe é atualizado, nunca duplicado."
          : targetType === "SERVICES"
            ? "Serviço com nome já existente no catálogo é ignorado."
            : "O serviço precisa já existir no catálogo. Profissionais são reconhecidos pelo nome.",
    },
    { step: 5, text: "Apague a linha de exemplo antes de enviar." },
  ]);

  const sheet = workbook.addWorksheet("Dados");
  sheet.columns = fields.map((field) => ({
    header: getFieldLabel(field, segment),
    key: field.key,
    width: Math.max(18, Math.min(34, getFieldLabel(field, segment).length + 6)),
  }));

  sheet.addRow(
    fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = EXAMPLES[field.key] ?? "";
      return acc;
    }, {}),
  );

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF3F8" },
  };

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    fileName: IMPORT_TEMPLATE_FILE_NAME[targetType],
    buffer,
  };
}
