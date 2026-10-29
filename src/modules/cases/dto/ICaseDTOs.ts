import type {
  CaseDocumentType,
  CaseEventType,
  CasePriority,
  CaseTaskStatus,
  ClientCaseStatus,
  DeadlineStatus,
  DeadlineType,
} from "@prisma/client";

/**
 * DTOs da gestão de processos do escritório (segmento LAW_FIRM).
 *
 * Tudo aqui é **interno do escritório**: nenhum destes campos vai para
 * mensagem ao cliente, perfil público ou assistente do WhatsApp.
 */

export interface ICaseTaskDTO {
  id: string;
  barbershopId: string;
  caseId: string;
  title: string;
  description?: string | null;
  status: CaseTaskStatus;
  priority: CasePriority;
  dueDate?: Date | null;
  assigneeStaffId?: string | null;
  assigneeName?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICaseDeadlineDTO {
  id: string;
  barbershopId: string;
  caseId?: string | null;
  caseName?: string | null;
  title: string;
  type: DeadlineType;
  status: DeadlineStatus;
  dueDate: Date;
  businessDays?: number | null;
  courtName?: string | null;
  notes?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Dias úteis que faltam (negativo = atraso). Calculado no use case. */
  daysRemaining?: number | null;
}

export interface ICaseEventDTO {
  id: string;
  barbershopId: string;
  caseId: string;
  type: CaseEventType;
  title: string;
  description?: string | null;
  occurredAt: Date;
  createdByUserId?: string | null;
  authorName?: string | null;
  /** Compartilhado com o cliente no portal (padrão: não). */
  visibleToClient: boolean;
  createdAt: Date;
}

export interface ICaseDocumentDTO {
  id: string;
  barbershopId: string;
  caseId: string;
  title: string;
  type: CaseDocumentType;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  version: number;
  notes?: string | null;
  createdByUserId?: string | null;
  authorName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOfficeHolidayDTO {
  id: string;
  barbershopId: string;
  date: Date;
  name: string;
  createdAt: Date;
}

/** Caso com o contexto do escritório (cliente, responsável e contadores). */
export interface ICaseSummaryDTO {
  id: string;
  barbershopId: string;
  clientId: string;
  clientName: string;
  nickname: string;
  title?: string | null;
  status: ClientCaseStatus;
  priority: CasePriority;
  practiceArea?: string | null;
  caseNumber?: string | null;
  courtName?: string | null;
  opponent?: string | null;
  claimedAmount?: number | null;
  awardedAmount?: number | null;
  responsibleStaffId?: string | null;
  responsibleName?: string | null;
  /** O caso aparece no portal do cliente. */
  shareWithClient: boolean;
  openedAt: Date;
  closedAt?: Date | null;
  active: boolean;
  openTasks: number;
  pendingDeadlines: number;
  nextDeadline?: ICaseDeadlineDTO | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Visão consolidada do caso (aba "Visão geral"). */
export interface ICaseOverviewDTO {
  case: ICaseSummaryDTO;
  tasks: { open: number; done: number; overdue: number };
  deadlines: { pending: number; overdue: number; next?: ICaseDeadlineDTO | null };
  documents: number;
  events: number;
  /** Honorários já cobrados no caso (atendimentos concluídos). */
  revenue: number;
  /** Atendimentos concluídos vinculados ao caso. */
  completedAppointments: number;
  /** Saldo em aberto do cliente (fiado). */
  outstanding: number;
}
