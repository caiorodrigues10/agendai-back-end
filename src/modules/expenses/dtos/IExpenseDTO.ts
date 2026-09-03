export type ExpenseType = "FIXED" | "VARIABLE" | "INVESTMENT"; // Tipo: Fixo | Variável | Investimento
export type ExpenseRecurrence = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; // Recorrência: Uma vez | Diária | Semanal | Mensal | Anual

export interface ICreateExpenseDTO {
  barbershopId: string;        // ID da barbearia dona da despesa
  categoryId?: string | null;  // ID da categoria (ex: "Aluguel", "Produtos") — opcional
  title: string;               // Título da despesa (ex: "Compra de shampoo")
  description?: string | null; // Descrição detalhada — opcional
  amount: number;              // Valor em reais (ex: 150.00)
  type?: ExpenseType;          // Tipo: FIXED, VARIABLE ou INVESTMENT — padrão VARIABLE
  recurrence?: ExpenseRecurrence; // Com que frequência se repete — padrão ONCE
  referenceDate: Date;         // Data de competência (mês/ano a que a despesa pertence)
  paidAt?: Date | null;        // Data em que foi pago — null = ainda não pago
  dueDate?: Date | null;       // Data de vencimento — opcional
  paymentMethod?: string | null; // Forma de pagamento (pix, dinheiro, boleto, cartão)
  supplierName?: string | null;  // Nome do fornecedor (ex: "Distribuidora Silva")
  receiptUrl?: string | null;    // URL do comprovante ou nota fiscal
  notes?: string | null;         // Observações livres
  createdById: string;           // ID do usuário que lançou a despesa
}

export interface IUpdateExpenseDTO {
  categoryId?: string | null;    // Nova categoria — null remove a categoria
  title?: string;                // Novo título
  description?: string | null;   // Nova descrição
  amount?: number;               // Novo valor
  type?: ExpenseType;            // Novo tipo
  recurrence?: ExpenseRecurrence; // Nova recorrência
  referenceDate?: Date;          // Nova data de competência
  paidAt?: Date | null;          // Marcar como pago (informar a data) ou desmarcar (null)
  dueDate?: Date | null;         // Novo vencimento
  paymentMethod?: string | null; // Nova forma de pagamento
  supplierName?: string | null;  // Novo fornecedor
  receiptUrl?: string | null;    // Novo comprovante
  notes?: string | null;         // Novas observações
}

export interface IExpenseResponseDTO {
  id: string;                  // ID único da despesa
  barbershopId: string;        // ID da barbearia
  categoryId: string | null;   // ID da categoria — null se sem categoria
  categoryName: string | null; // Nome da categoria já resolvido — null se sem categoria
  title: string;               // Título da despesa
  description: string | null;  // Descrição
  amount: number;              // Valor em reais
  type: ExpenseType;           // Tipo (FIXED, VARIABLE, INVESTMENT)
  recurrence: ExpenseRecurrence; // Recorrência (ONCE, MONTHLY, etc.)
  referenceDate: Date;         // Data de competência
  paidAt: Date | null;         // Data do pagamento — null = pendente
  dueDate: Date | null;        // Data de vencimento
  paymentMethod: string | null; // Forma de pagamento
  supplierName: string | null;  // Nome do fornecedor
  receiptUrl: string | null;    // URL do comprovante
  notes: string | null;         // Observações
  createdById: string;          // ID de quem lançou
  locked?: boolean;
  inventoryReceiptId?: string | null;
  createdAt: Date;              // Data de criação do registro
  updatedAt: Date;              // Data da última atualização
}

export interface IExpenseListQuery {
  page: number;                  // Página atual (paginação)
  limit: number;                 // Quantidade de itens por página
  categoryId?: string;           // Filtrar por categoria
  type?: ExpenseType;            // Filtrar por tipo (FIXED, VARIABLE, INVESTMENT)
  recurrence?: ExpenseRecurrence; // Filtrar por recorrência
  from?: Date;                   // Data de referência inicial do filtro
  to?: Date;                     // Data de referência final do filtro
  paid?: boolean;                // true = só pagas | false = só pendentes | undefined = todas
  search?: string;               // Busca por texto no título, fornecedor ou observações
}

export interface IExpenseSummary {
  totalAmount: number;   // Soma total de todas as despesas no período
  totalPaid: number;     // Soma apenas das despesas já pagas
  totalPending: number;  // Soma das despesas ainda não pagas (totalAmount - totalPaid)
  byCategory: Array<{    // Totais agrupados por categoria
    categoryId: string | null;   // ID da categoria — null = sem categoria
    categoryName: string | null; // Nome da categoria
    total: number;               // Valor total da categoria
    count: number;               // Quantidade de despesas na categoria
  }>;
  byType: Array<{        // Totais agrupados por tipo
    type: ExpenseType;   // FIXED, VARIABLE ou INVESTMENT
    total: number;       // Valor total do tipo
    count: number;       // Quantidade de despesas do tipo
  }>;
  byMonth: Array<{       // Totais agrupados por mês
    month: string;       // Formato "YYYY-MM" (ex: "2026-06")
    total: number;       // Valor total do mês
    count: number;       // Quantidade de despesas no mês
  }>;
}