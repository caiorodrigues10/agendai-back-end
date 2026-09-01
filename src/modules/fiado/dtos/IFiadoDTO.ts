// Status possíveis de um fiado — progride conforme pagamentos são registrados
export type FiadoStatus =
  | "PENDING"   // devendo tudo, não pagou nada ainda
  | "PARTIAL"   // pagou parte, ainda tem saldo devedor
  | "PAID"      // quitado completamente
  | "FORGIVEN"; // dívida perdoada/cancelada pelo barbeiro

// ─── DTOs de entrada ──────────────────────────────────────────────────────────

// Dados necessários para registrar um novo fiado
export interface ICreateFiadoDTO {
  barbershopId: string;      // barbearia onde o fiado foi gerado
  customerName: string;      // nome do cliente devedor
  whatsapp: string;          // contato do cliente
  clientId?: string | null;  // vínculo explícito com CRM
  description: string;       // o que foi fiado (ex: "Corte + barba")
  amount: number;            // valor total da dívida em reais
  dueDate?: Date | null;     // prazo combinado para pagamento (opcional)
  notes?: string | null;     // observações livres do barbeiro (opcional)
  createdById: string;       // ID do funcionário que registrou o fiado
}

// Dados para registrar um pagamento (parcial ou total) de um fiado existente
export interface ICreateFiadoPaymentDTO {
  fiadoId: string;           // ID do fiado que está sendo pago
  barbershopId: string;      // barbearia dona do fiado (usado na autorização)
  amount: number;            // valor pago agora (pode ser menor que o total)
  notes?: string | null;     // observação sobre o pagamento (opcional)
  registeredById: string;    // ID do funcionário que registrou o pagamento
}

// Dados que podem ser atualizados em um fiado existente
export interface IUpdateFiadoDTO {
  description?: string;      // nova descrição
  amount?: number;           // novo valor original (corrige lançamento errado)
  dueDate?: Date | null;     // novo prazo — null remove o prazo
  notes?: string | null;     // novas observações
  status?: FiadoStatus;      // usado para marcar como FORGIVEN manualmente
}

// ─── DTOs de saída ────────────────────────────────────────────────────────────

// Representa um pagamento individual dentro do histórico do fiado
export interface IFiadoPaymentResponseDTO {
  id: string;                // ID único do pagamento
  fiadoId: string;           // fiado ao qual este pagamento pertence
  amount: number;            // valor pago nesta entrada
  notes: string | null;      // observação do pagamento
  registeredById: string;    // quem registrou o pagamento
  createdAt: Date;           // quando o pagamento foi registrado
}

// Representa um fiado completo com todo o histórico de pagamentos
export interface IFiadoResponseDTO {
  id: string;                // ID único do fiado
  barbershopId: string;      // barbearia dona do fiado
  customerName: string;      // nome do cliente devedor
  whatsapp: string;          // contato do cliente
  clientId?: string | null;
  description: string;       // o que foi fiado
  originalAmount: number;    // valor original cobrado pelo serviço
  paidAmount: number;        // soma de tudo que já foi pago até agora
  remainingAmount: number;   // quanto ainda falta pagar (originalAmount - paidAmount)
  status: FiadoStatus;       // situação atual do fiado
  dueDate: Date | null;      // prazo combinado — null se não foi definido
  notes: string | null;      // observações do barbeiro
  createdById: string;       // quem criou o fiado
  createdAt: Date;           // quando o fiado foi criado
  updatedAt: Date;           // última atualização (pagamento, edição, etc.)
  payments: IFiadoPaymentResponseDTO[]; // histórico completo de pagamentos
  isOverdue: boolean;        // true se passou do dueDate e ainda está em aberto
}

// ─── Query de listagem ────────────────────────────────────────────────────────

// Filtros disponíveis ao listar fiados de uma barbearia
export interface IFiadoListQuery {
  page: number;              // página atual (começa em 1)
  limit: number;             // itens por página (máx 100)
  status?: FiadoStatus;      // filtrar por status específico
  search?: string;           // busca por nome do cliente ou whatsapp
  overdue?: boolean;         // true = mostrar apenas os vencidos
  from?: Date;               // data de criação mínima
  to?: Date;                 // data de criação máxima
}

// ─── Resumo financeiro ────────────────────────────────────────────────────────

// Dados agregados dos fiados ativos de uma barbearia (apenas PENDING e PARTIAL)
export interface IFiadoSummary {
  totalDebtors: number;      // quantas pessoas estão devendo atualmente
  totalPending: number;      // soma total do que ainda está em aberto (R$)
  totalOriginal: number;     // soma dos valores originais de todas as dívidas ativas
  totalPaid: number;         // soma do que já foi pago nas dívidas ainda abertas
  overdueCount: number;      // quantos fiados passaram do prazo sem quitar
  overdueAmount: number;     // valor total em aberto dos fiados vencidos (R$)
}
