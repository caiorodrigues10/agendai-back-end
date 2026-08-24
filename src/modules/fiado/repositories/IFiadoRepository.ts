import {
  ICreateFiadoDTO,
  ICreateFiadoPaymentDTO,
  IUpdateFiadoDTO,
  IFiadoResponseDTO,
  IFiadoListQuery,
  IFiadoSummary,
  IFiadoPaymentResponseDTO,
} from "../dtos/IFiadoDTO";

export interface IFiadoRepository {
  create(data: ICreateFiadoDTO): Promise<IFiadoResponseDTO>;
  findById(id: string): Promise<IFiadoResponseDTO | null>;
  list(
    query: IFiadoListQuery & { barbershopId: string }
  ): Promise<{ data: IFiadoResponseDTO[]; total: number }>;
  update(id: string, data: IUpdateFiadoDTO): Promise<IFiadoResponseDTO>;
  delete(id: string): Promise<void>;
  addPayment(data: ICreateFiadoPaymentDTO): Promise<IFiadoPaymentResponseDTO>;
  getSummary(barbershopId: string): Promise<IFiadoSummary>;
}
