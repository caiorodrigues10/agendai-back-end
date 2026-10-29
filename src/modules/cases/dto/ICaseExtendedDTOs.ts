import type {
  CaseEventType,
  CaseTransferStatus,
  ContractStatus,
  ContractType,
  DeadlineAlertChannel,
  DeadlineAlertKind,
  DeadlineAlertStatus,
  FeeInvoiceProvider,
  FeeInvoiceStatus,
  IntimationSource,
  IntimationStatus,
  SignatureRole,
  SignatureStatus,
  SignatureType,
  SuccessFeeStatus,
} from "@prisma/client";

/**
 * DTOs do backlog de gestão de processos.
 *
 * Contratos/procurações com assinatura, timesheet, honorários de êxito,
 * digestão de intimações (PJe/tribunal), NFS-e, alertas de prazo e
 * transferência entre unidades.
 *
 * Sigilo: nada destes DTOs vai para o cliente exceto o que o escritório
 * marcar explicitamente (portal do cliente).
 */

export interface ICaseContractDTO {
  id: string;
  barbershopId: string;
  caseId: string;
  clientId: string;
  clientName?: string | null;
  title: string;
  type: ContractType;
  status: ContractStatus;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  value?: number | null;
  feePercent?: number | null;
  notes: string | null;
  signedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  signatures: IContractSignatureDTO[];
  pendingSignatures: number;
}

export interface IContractSignatureDTO {
  id: string;
  barbershopId: string;
  contractId: string;
  signerName: string;
  signerEmail?: string | null;
  signerWhatsapp?: string | null;
  role: SignatureRole;
  status: SignatureStatus;
  token?: string;
  signatureUrl: string | null;
  signatureType: SignatureType;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICaseTimeEntryDTO {
  id: string;
  barbershopId: string;
  caseId: string;
  clientId: string;
  staffUserId: string;
  staffName?: string | null;
  description?: string | null;
  minutes: number;
  billable: boolean;
  hourlyRate?: number | null;
  billed: boolean;
  entryDate: Date;
  /** Valor cobrável calculado (minutes/60 × hourlyRate). */
  amount?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITimeEntrySummaryDTO {
  totalMinutes: number;
  billableMinutes: number;
  billableAmount: number;
  unbilledAmount: number;
  entryCount: number;
}

export interface ICaseSuccessFeeDTO {
  id: string;
  barbershopId: string;
  caseId: string;
  caseName?: string | null;
  percent: number;
  baseAmount?: number | null;
  amount?: number | null;
  installments: number;
  status: SuccessFeeStatus;
  dueDate?: Date | null;
  paidAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICourtIntimationDTO {
  id: string;
  barbershopId: string;
  caseId?: string | null;
  caseName?: string | null;
  source: IntimationSource;
  receivedAt: Date;
  subject: string;
  body: string;
  detectedNumber?: string | null;
  suggestedType: CaseEventType;
  status: IntimationStatus;
  triagedAt?: Date | null;
  linkedEventId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICaseFeeInvoiceDTO {
  id: string;
  barbershopId: string;
  caseId?: string | null;
  clientId?: string | null;
  invoiceNumber?: string | null;
  externalId?: string | null;
  provider: FeeInvoiceProvider;
  status: FeeInvoiceStatus;
  description: string;
  amount: number;
  issRetained: boolean;
  taxpayerId?: string | null;
  issuedAt?: Date | null;
  xmlUrl?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeadlineAlertDTO {
  id: string;
  barbershopId: string;
  deadlineId: string;
  deadlineTitle?: string | null;
  userId: string;
  channel: DeadlineAlertChannel;
  kind: DeadlineAlertKind;
  daysRemaining?: number | null;
  sentOn: Date;
  status: DeadlineAlertStatus;
  sentAt?: Date | null;
  errorMessage?: string | null;
  createdAt: Date;
}

export interface ICaseTransferDTO {
  id: string;
  barbershopId: string;
  originName?: string | null;
  caseId: string;
  caseName?: string | null;
  targetBarbershopId: string;
  targetName?: string | null;
  reason?: string | null;
  status: CaseTransferStatus;
  requestedByUserId: string;
  acceptedByUserId?: string | null;
  acceptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Visão do caso para o portal do cliente — **sem número de processo, sem
 * apelido interno, sem parte adversária, sem tribunal e sem observações**.
 */
export interface IClientPortalCaseDTO {
  id: string;
  /** Rótulo seguro exibido ao cliente (área do direito ou "Processo"). */
  label: string;
  status: string;
  practiceArea?: string | null;
  /** Próximo compromisso do caso (quando houver). */
  nextAppointment?: {
    id: string;
    scheduledAt: Date;
    serviceName?: string | null;
  } | null;
  /** Andamentos que o escritório marcou como visíveis ao cliente. */
  sharedEvents: Array<{
    id: string;
    type: CaseEventType;
    title: string;
    description?: string | null;
    occurredAt: Date;
  }>;
  /** Contratos que aguardam a assinatura do cliente. */
  pendingSignatures: Array<{
    id: string;
    contractTitle: string;
    token: string;
  }>;
}
