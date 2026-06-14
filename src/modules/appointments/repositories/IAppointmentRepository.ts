import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
} from "../dtos/IAppointmentDTO";

export interface IAppointmentRepository {
  create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO>;
  findById(id: string): Promise<IAppointmentResponseDTO | null>;
  list(
    barbershopId: string,
    query: IListAppointmentsQuery
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }>;
  update(id: string, data: IUpdateAppointmentDTO): Promise<IAppointmentResponseDTO>;
  delete(id: string): Promise<void>;
}
