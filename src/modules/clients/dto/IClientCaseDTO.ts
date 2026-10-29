import type { CasePriority, ClientCaseStatus } from "@prisma/client";

export interface ICreateClientCaseDTO {
  barbershopId: string;
  clientId: string;
  /** Apelido interno do caso (ex.: "Ação de cobrança"). */
  nickname: string;
  /** Área do direito (ex.: "Cível"). */
  practiceArea?: string | null;
  /** Número do processo no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). */
  caseNumber?: string | null;
  /** Observação interna curta. */
  notes?: string | null;
  /** Situação no pipeline do escritório. */
  status?: ClientCaseStatus;
  /** Prioridade de trabalho. */
  priority?: CasePriority;
  /** Título do processo como aparece no tribunal. */
  title?: string | null;
  /** Órgão julgador / vara. */
  courtName?: string | null;
  /** Parte adversária. */
  opponent?: string | null;
  /** Valor da causa (pretensão). */
  claimedAmount?: number | null;
  /** Valor obtido. */
  awardedAmount?: number | null;
  /** Advogado(a) responsável (User do escritório). */
  responsibleStaffId?: string | null;
  /** Compartilha o caso com o cliente no portal. */
  shareWithClient?: boolean;
}

export interface IUpdateClientCaseDTO {
  nickname?: string;
  practiceArea?: string | null;
  caseNumber?: string | null;
  notes?: string | null;
  active?: boolean;
  status?: ClientCaseStatus;
  priority?: CasePriority;
  title?: string | null;
  courtName?: string | null;
  opponent?: string | null;
  claimedAmount?: number | null;
  awardedAmount?: number | null;
  responsibleStaffId?: string | null;
  /** Compartilha o caso com o cliente no portal. */
  shareWithClient?: boolean;
}

export interface IClientCaseResponseDTO {
  id: string;
  barbershopId: string;
  clientId: string;
  nickname: string;
  practiceArea?: string | null;
  caseNumber?: string | null;
  notes?: string | null;
  active: boolean;
  status: ClientCaseStatus;
  priority: CasePriority;
  title?: string | null;
  courtName?: string | null;
  opponent?: string | null;
  claimedAmount?: number | null;
  awardedAmount?: number | null;
  responsibleStaffId?: string | null;
  /** O caso aparece no portal do cliente. */
  shareWithClient: boolean;
  openedAt: Date;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
