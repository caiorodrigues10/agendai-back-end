import {
  ICreateSalonClientDTO,
  IUpdateSalonClientDTO,
  ISalonClientListQuery,
  ISalonClientResponseDTO,
} from "../dtos/ISalonClientDTO";

export interface ISalonClientRepository {
  create(data: ICreateSalonClientDTO): Promise<ISalonClientResponseDTO>;
  findById(id: string): Promise<ISalonClientResponseDTO | null>;
  findByWhatsapp(
    barbershopId: string,
    whatsapp: string
  ): Promise<ISalonClientResponseDTO | null>;
  /** Fila/agenda → CRM. Sem nome válido retorna null. */
  upsertFromVisit(
    barbershopId: string,
    name: string,
    whatsapp: string
  ): Promise<{ id: string } | null>;
  list(
    query: ISalonClientListQuery & { barbershopId: string }
  ): Promise<{ data: ISalonClientResponseDTO[]; total: number }>;
  update(id: string, data: IUpdateSalonClientDTO): Promise<ISalonClientResponseDTO>;
  delete(id: string): Promise<void>;
}
