/**
 * Geração do modelo (.xlsx) para download.
 *
 * O modelo já vem com os cabeçalhos na ordem certa para o segmento do salão,
 * duas linhas de exemplo e uma aba "Como preencher" com as regras do tipo —
 * o dono preenche e sobe. É a forma mais rápida de o mapeamento automático
 * acertar de primeira.
 */
import ExcelJS from "exceljs";
import { IMPORT_TEMPLATE_FILE_NAME } from "./dataImport.constants";
import type { ImportTargetType } from "./dataImport.types";
import { availableFields, getFieldLabel } from "./utils/columnMapping";
import type { BusinessSegment } from "@prisma/client";

/**
 * Duas linhas de exemplo por alvo — no formato aceito pela importação
 * (datas dd/mm/aaaa, horas hh:mm, valores com vírgula).
 */
const EXAMPLES: Record<ImportTargetType, Array<Record<string, string>>> = {
  CLIENTS: [
    {
      name: "Maria da Silva",
      whatsapp: "11987654321",
      email: "maria@example.com",
      birthDate: "12/05/1990",
      notes: "Cliente desde 2024",
    },
    {
      name: "João Souza",
      whatsapp: "21999887766",
      email: "",
      birthDate: "",
      notes: "",
    },
  ],
  SERVICES: [
    {
      serviceName: "Corte de cabelo",
      description: "Corte social",
      price: "80,00",
      durationMinutes: "45",
      category: "Cabelo",
    },
    {
      serviceName: "Barba",
      description: "Barba completa",
      price: "40,00",
      durationMinutes: "30",
      category: "Cabelo",
    },
  ],
  APPOINTMENTS: [
    {
      clientName: "Maria da Silva",
      clientWhatsapp: "11987654321",
      staffName: "João",
      serviceName: "Corte de cabelo",
      date: "05/11/2026",
      time: "14:00",
      status: "Confirmado",
      finalPrice: "80,00",
      paymentMethod: "Pix",
      modality: "Presencial",
    },
    {
      clientName: "João Souza",
      clientWhatsapp: "21999887766",
      staffName: "Ana",
      serviceName: "Barba",
      date: "06/11/2026",
      time: "10:30",
      status: "Confirmado",
      finalPrice: "40,00",
      paymentMethod: "Dinheiro",
      modality: "Presencial",
    },
  ],
  STAFF_SCHEDULES: [
    {
      staffName: "João",
      dayOfWeek: "Segunda",
      startTime: "09:00",
      endTime: "18:00",
      pauseStart: "13:00",
      pauseEnd: "14:00",
    },
    {
      staffName: "Ana",
      dayOfWeek: "Terça",
      startTime: "10:00",
      endTime: "19:00",
      pauseStart: "",
      pauseEnd: "",
    },
  ],
  SHOP_SCHEDULE: [
    {
      dayOfWeek: "Segunda",
      isOpen: "Sim",
      startTime: "09:00",
      endTime: "19:00",
    },
    {
      dayOfWeek: "Domingo",
      isOpen: "Não",
      startTime: "",
      endTime: "",
    },
  ],
  TIME_OFF: [
    {
      staffName: "João",
      startDate: "10/11/2026",
      endDate: "12/11/2026",
      timeOffReason: "Férias",
      timeOffStatus: "Aprovada",
    },
    {
      staffName: "Ana",
      startDate: "20/11/2026",
      endDate: "20/11/2026",
      timeOffReason: "Consulta médica",
      timeOffStatus: "Aprovada",
    },
  ],
  PRODUCTS: [
    {
      productName: "Shampoo Hidratante 500ml",
      productSku: "SH-500",
      productBarcode: "7891234567890",
      productCategory: "Cuidados",
      productDescription: "Shampoo de hidratação",
      productUnit: "Unidade",
      productUnitLabel: "un",
      productType: "Venda",
      salePrice: "39,90",
      costPrice: "18,00",
      stockQty: "12",
      minStock: "3",
    },
    {
      productName: "Óleo de Argan 100ml",
      productSku: "OL-100",
      productBarcode: "",
      productCategory: "Cuidados",
      productDescription: "",
      productUnit: "Unidade",
      productUnitLabel: "un",
      productType: "Venda",
      salePrice: "54,90",
      costPrice: "25,00",
      stockQty: "5",
      minStock: "2",
    },
  ],
  SERVICE_PACKAGES: [
    {
      packageName: "Pacote 5 Cortes",
      serviceName: "Corte de cabelo",
      sessionCount: "5",
      packagePrice: "350,00",
      validityDays: "90",
    },
    {
      packageName: "Pacote 3 Barbas",
      serviceName: "Barba",
      sessionCount: "3",
      packagePrice: "100,00",
      validityDays: "60",
    },
  ],
  CLIENT_PACKAGES: [
    {
      clientName: "Maria da Silva",
      clientWhatsapp: "11987654321",
      packageName: "Pacote 5 Cortes",
      totalSessions: "5",
      remainingSessions: "4",
      pricePaid: "350,00",
      purchasedAt: "01/10/2026",
      expiresAt: "30/12/2026",
    },
    {
      clientName: "João Souza",
      clientWhatsapp: "21999887766",
      packageName: "Pacote 3 Barbas",
      totalSessions: "3",
      remainingSessions: "3",
      pricePaid: "100,00",
      purchasedAt: "05/10/2026",
      expiresAt: "04/12/2026",
    },
  ],
  FIADOS: [
    {
      customerName: "Maria da Silva",
      whatsapp: "11987654321",
      fiadoDescription: "Corte + shampoo",
      originalAmount: "119,90",
      paidAmount: "0,00",
      dueDate: "15/11/2026",
    },
    {
      customerName: "João Souza",
      whatsapp: "21999887766",
      fiadoDescription: "Barba",
      originalAmount: "40,00",
      paidAmount: "40,00",
      dueDate: "30/11/2026",
    },
  ],
};

/** Regras do tipo — a aba "Como preencher" explica o comportamento do lote. */
const TARGET_RULES: Record<ImportTargetType, string[]> = {
  CLIENTS: [
    "O telefone identifica o cliente: quem já existe é atualizado, nunca duplicado.",
    "Cliente sem telefone não entra — sem identidade o lote criaria cópias a cada reimportação.",
  ],
  SERVICES: [
    "Serviço com nome já existente no catálogo é ignorado.",
    "Preço e duração alimentam o catálogo; nada entra no financeiro.",
  ],
  APPOINTMENTS: [
    "O serviço precisa já existir no catálogo. Profissionais são reconhecidos pelo nome.",
    "Agendamento duplicado (mesmo cliente, serviço e horário) é ignorado.",
    "O histórico importado alimenta o CRM — não gera receita, comissão nem mensagem ao cliente.",
  ],
  STAFF_SCHEDULES: [
    "O profissional precisa já existir na equipe. A importação nunca cria usuário com login.",
    "Nome ambíguo (dois profissionais com o mesmo nome) rejeita a linha.",
    "Horário já configurado é preservado por padrão; a opção \"substituir dias da planilha\" troca.",
  ],
  SHOP_SCHEDULE: [
    "Um dia por linha. Dia já configurado é preservado por padrão.",
    "Dias fechados entram com \"Aberto = Não\".",
  ],
  TIME_OFF: [
    "O profissional precisa já existir na equipe.",
    "A folga entra aprovada por padrão — a opção \"importar como pendente\" deixa para analisar depois.",
    "Data inicial e final inclusivas. Data final igual à inicial = um dia só.",
  ],
  PRODUCTS: [
    "Produto repetido (mesmo SKU, código de barras ou nome) é ignorado por padrão.",
    "O saldo inicial vira movimento de estoque — não é compra e não entra no caixa.",
    "A coluna de imagem é ignorada: a importação não baixa imagem de produto.",
    "Categorias que não existem só são criadas com a opção \"criar categorias\" ligada.",
  ],
  SERVICE_PACKAGES: [
    "O serviço do pacote precisa já existir no catálogo.",
    "Pacote com o mesmo nome e serviço é ignorado.",
    "Pacote do catálogo não é venda: nada entra no ledger financeiro nem no CRM.",
  ],
  CLIENT_PACKAGES: [
    "O pacote do catálogo precisa já existir.",
    "Cliente novo é criado junto; o telefone identifica quem é.",
    "Saldo inicial de pacote não registra venda: nada entra no ledger financeiro.",
  ],
  FIADOS: [
    "O telefone liga a dívida ao cliente do CRM. A importação não cria cliente novo aqui.",
    "Dívida importada não entra no primeiro ciclo de cobrança — a cobrança é manual.",
    "\"Valor já pago\" é um pagamento de forma \"other\": não entra no caixa nem no ledger.",
  ],
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
    ...TARGET_RULES[targetType].map((text, index) => ({ step: 4 + index, text })),
    {
      step: 4 + TARGET_RULES[targetType].length,
      text: "Apague as linhas de exemplo antes de enviar.",
    },
  ]);

  const sheet = workbook.addWorksheet("Dados");
  sheet.columns = fields.map((field) => ({
    header: getFieldLabel(field, segment),
    key: field.key,
    width: Math.max(18, Math.min(34, getFieldLabel(field, segment).length + 6)),
  }));

  for (const example of EXAMPLES[targetType]) {
    sheet.addRow(
      fields.reduce<Record<string, string>>((acc, field) => {
        acc[field.key] = example[field.key] ?? "";
        return acc;
      }, {}),
    );
  }

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
